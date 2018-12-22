#!/usr/bin/env python3

from splinter import Browser
from bs4 import BeautifulSoup
import json
import re
import sys
import os
import datetime
import hashlib
import http.client
import hmac
import base64
import urllib.parse
from multiprocessing import Pool, Lock
import argparse
import requests
import collections
import subprocess

MAX_PORTAL_CHROME_RETRIES = 5
MAX_PORTAL_FIREFOX_RETRIES = 2

ENDPOINT = 'www.lingkapis.com'
SERVICE = '/v1/harveymudd/coursecatalog/ps/datasets/coursecatalog'
QUERYSTRING = '?limit=1000000000'
MAX_RETRIES = 15

if 'KEY' in os.environ and 'SECRET' in os.environ:
    KEY = os.environ['KEY']
    SECRET = bytes(os.environ['SECRET'], 'ascii')
else:
    try:
        mydir = os.path.dirname(os.path.abspath(__file__))
        KEY = subprocess.check_output(['bash', '-c', 'source .env && printf %s "$KEY"'], cwd=mydir).decode('ascii')
        SECRET = subprocess.check_output(['bash', '-c', 'source .env && printf %s "$SECRET"'], cwd=mydir)
    except:
        print('KEY and SECRET not provided; API not available', file=sys.stderr)
        KEY = ''
        SECRET = b''

TERM_RE = re.compile(r'(?P<season>[A-Z]{2}) (?P<part>(?:[A-Z0-9]{2})?) (?P<year>[0-9]{4})')
def term_sort(term):
    m = TERM_RE.match(term)
    if m:
        return (-int(m.group('year')), -{'SP': 0, 'SU': 1, 'FA': 2}[m.group('season')], m.group('part'))
    else:
        return (0, 0, '')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', '-d', default='.', action='store')
    which_data = parser.add_mutually_exclusive_group()
    which_data.add_argument('--all-terms', '-a', action='store_true')
    which_data.add_argument('--api-classes', '-p', action='store_true')
    parser.add_argument('--no-save', '-e', '--dry-run', action='store_true')
    parser.add_argument('--fetch-infomap', '-i', action='store_true')
    args = parser.parse_args()
    api_data = fetch_api_data()['data']
    api_classes_by_term = format_api_data_as_portal_data(api_data)
    selected_term, all_terms, courseareas = fetch_portal_info()
    all_terms.sort(key=term_sort)
    api_extra_terms = sorted(api_classes_by_term.keys() - set(all_terms), key=term_sort)
    if args.all_terms:
        terms_to_fetch = all_terms
    elif args.api_classes:
        terms_to_fetch = [term for term in all_terms if term in api_classes_by_term]
    else:
        terms_to_fetch = all_terms[:all_terms.index(selected_term)+1]
    classes_by_term = fetch_some_portal_classes(terms_to_fetch)
    merge(classes_by_term, api_classes_by_term)
    if len(api_extra_terms) > 0 and (term_sort(api_extra_terms[0]) < term_sort(selected_term)):
        selected_term = api_extra_terms[0]
    if args.fetch_infomap:
        infomaps = {term: fetch_portal_areamap(term, courseareas) for term in terms_to_fetch}
    if not args.no_save:
        os.makedirs(args.directory, exist_ok=True)
        with open(os.path.join(args.directory, 'main.json'), 'w') as f:
            json.dump({'terms': sorted(all_terms + api_extra_terms, key=term_sort),
                       'areas': courseareas,
                       'selected': selected_term,
                       'selected_data': classes_by_term[selected_term]},
                      f, separators=(',',':'))
        for term in terms_to_fetch + api_extra_terms:
            with open(os.path.join(args.directory, term+'.json'), 'w') as f:
                json.dump(classes_by_term[term], f, separators=(',',':'))
            if args.fetch_infomap:
                with open(os.path.join(args.directory, term+'_infomap.json'), 'w') as f:
                    json.dump(infomaps[term], f, separators=(',',':'))

def format_api_data_as_portal_data(api_data):
    api_classes = {api_class['courseNumber']: api_class for api_class in api_data if 'courseNumber' in api_class}
    api_classes_by_term = {}
    for api_class in api_data:
        merge(api_classes_by_term, api_class_to_portal_classes(api_class))
    # return classes in sorted order
    for term in api_classes_by_term:
        api_classes_by_term[term] = collections.OrderedDict(sorted(api_classes_by_term[term].items()))
    return api_classes_by_term

API_TERM_RE = re.compile(r'^(?P<season>FA|SP|SU)(?P<year>[0-9]{4})(?P<part>[FP][12])?$')
def api_term_to_portal_terms(api_term):
    m = API_TERM_RE.match(api_term)
    if not m:
        print('bad api designator: {}'.format(api_term), file=sys.stderr)
        return api_term
    return {m.expand('\g<season> \g<part> \g<year>'), m.expand('\g<season>  \g<year>')}

def api_class_to_portal_classes(course):
    portal_data = {}
    if 'courseNumber' not in course:
        # fake course; ignore
        return {}
    if course['externalId'].startswith('\n"'):
        course['externalId'] = course['externalId'][2:]
    for section in course['courseSections']:
        if 'calendarSessions' not in section:
           # some scripps courses don't say what semester they are
           # we'll just ignore them
           continue
        for semester in section['calendarSessions']:
            portal_terms = api_term_to_portal_terms(semester['externalId'])
            for portal_term in portal_terms:
                if not portal_term in portal_data:
                    portal_data[portal_term] = {course['externalId']: {}}
                merge(portal_data[portal_term][course['externalId']],
                      api_semester_session_to_portal_class(course, section, semester))
    return portal_data

def api_semester_session_to_portal_class(course, section, semester):
    if not section['externalId'].endswith(semester['externalId']):
        print('invalid section id: {!r}; should end in {!r}'.format(
              section['externalId'], semester['externalId'], file=sys.stderr))
    if not 'courseSectionSchedule' in section:
        # these sections should not be returned by the API anyways...
        #print('Warning: section missing schedule: {}'.format(section['externalId']), file=sys.stderr)
        return {}
    section_id = section['externalId'][:-len(' '+semester['externalId'])]
    section_data = parse_section_id(section_id)
    section_data['section_id'] = section_id
    #section_data['name'] = course['courseTitle']
    if 'sectionInstructor' in section:
        section_data['instructors'] = api_instructor_names(section['sectionInstructor'])
    else:
        section_data['instructors'] = []
    if 'capacity' in section:
        section_data['capacity'] = section['capacity']
    if 'currentEnrollment' in section:
        section_data['currentEnrollment'] = section['currentEnrollment']
    section_data['startDate'] = semester['beginDate']
    section_data['endDate'] = semester['endDate']
    section_data['schedule'] = [parse_api_schedule(schedulePart)
                                for schedulePart in section['courseSectionSchedule']
                                if schedulePart['ClassMeetingDays'] != '-------']
    class_data = {
        'sections': {
            section_data['section']: section_data,
        },
        'id': section_data['id'],
        'campus': section_data['campus'],
        'name': course['courseTitle'],
    }
    
    if 'description' in course:
        class_data['description'] = course['description']
    
    return class_data

def api_instructor_names(api_instructors):
    instructors = []
    for instructor in api_instructors:
        if 'firstName' in instructor:
            if 'lastName' in instructor:
                instructors.append(instructor['lastName'] + ', ' + instructor['firstName'])
            else:
                instructors.append(instructor['firstName'])
        else:
            if 'lastName' in instructor:
                instructors.append(instructor['lastName'])
    return instructors

def parse_api_schedule(schedule_part):
    if len(schedule_part['ClassEndingTime']) == 2:
        print(schedule_part)
    return {
        'days': schedule_part['ClassMeetingDays'].replace('-',''),
        'start_time': reformat_api_time(schedule_part['ClassBeginningTime']),
        'end_time': reformat_api_time(schedule_part['ClassEndingTime']),
        'site': schedule_part['InstructionSiteName'].strip(),
        # what about the start and end dates?
    }

def reformat_api_time(api_time):
    if api_time == '0':
        return None
    api_time = '0000' + api_time
    minutes = int(api_time[-2:])
    hours = int(api_time[:-2])
    time_obj = datetime.time(hour=hours, minute=minutes)
    return time_obj.isoformat()

def create_signature(secret, signingStr):
    '''Creates signature for a signing string'''
    message = bytes(signingStr, 'ascii')
    signature = base64.b64encode(hmac.new(secret, message, digestmod=hashlib.sha1).digest())
    return signature

def create_auth_header(keyId, secret, dateStr):
    '''Generates authorization header for a given key and secret'''
    requestPath = SERVICE
    requestMethod = 'GET'
    signingStr = 'date: ' + dateStr +  '\n(request-target): ' + requestMethod.lower() + ' ' + requestPath
    encodedHMAC = urllib.parse.quote(create_signature(secret, signingStr))
    return 'Signature keyId="' + keyId + '",algorithm="hmac-sha1",headers="date (request-target)",signature="' + encodedHMAC + '"'

def get_HTTP_response(endPoint, authorizationHeader, dateStr):
    '''Connects to an endpoint via HTTPS and retrieves response'''
    headers = {'Date': dateStr, 'Authorization': authorizationHeader}
    return requests.get('https://' + endPoint + SERVICE + QUERYSTRING, headers=headers)

def fetch_api_data():
    json_err = None
    for _ in range(MAX_RETRIES):
        dateStr = datetime.datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S UTC')

        authorizationHeader = create_auth_header(KEY, SECRET, dateStr)
        res = get_HTTP_response(ENDPOINT, authorizationHeader, dateStr)

        try:
            json_data = res.json()
            print('.', end='', flush=True, file=sys.stderr)
            return json_data
        except json.decoder.JSONDecodeError as e:
            # sometimes API auth is finicky; try again.
            json_err = e
            print('x', end='', flush=True, file=sys.stderr)
            continue
    print('\nError: not JSON', file=sys.stderr)
    print(res.content, file=sys.stderr)
    raise json_err

def fetch_portal(term=None, coursearea=None):
    for i in range(MAX_PORTAL_CHROME_RETRIES):
        try:
            with Browser('chrome', headless=True) as browser:
                return fetch_portal_with_browser(browser, term, coursearea)
        except:
            print('X', end='', flush=True, file=sys.stderr)
    for i in range(MAX_PORTAL_FIREFOX_RETRIES):
        try:
            with Browser('firefox', headless=True) as browser:
                return fetch_portal_with_browser(browser, term, coursearea)
        except:
            print('X', end='', flush=True, file=sys.stderr)
    raise Exception('error fetching portal: term="{}", area="{}"'.format(term, coursearea))

def fetch_portal_with_browser(browser, term, coursearea):
    print('.', end='', flush=True, file=sys.stderr)
    browser.visit('https://portal.hmc.edu/ICS/default.aspx?portlet=Course_Schedules&screen=Advanced+Course+Search')
    print('.', end='', flush=True, file=sys.stderr)
    if term is not None:
        term_selector = browser.find_by_id('pg0_V_ddlTerm').first
        selected_term = term_selector.find_by_css('[selected]').first.text
        if term.replace(' ', '') != selected_term.replace(' ', ''):
            term_selector.select_by_text(term)
    print('.', end='', flush=True, file=sys.stderr)
    if coursearea is None:
        browser.fill('pg0$V$txtTitleRestrictor', '*')
    else:
        coursearea_selector = browser.find_by_id('pg0_V_ddlAdditional').first
        coursearea_selector.select_by_text(coursearea)
    browser.click_link_by_id('pg0_V_btnSearch')
    print('.', end='', flush=True, file=sys.stderr)
    if len(browser.find_by_id('pg0_V_lnkShowAll')) > 0:
        browser.click_link_by_id('pg0_V_lnkShowAll')
    print('.', end='', flush=True, file=sys.stderr)
    return browser.html

def fetch_portal_with_term(term):
    return term, fetch_portal(term=term)

def fetch_portal_with_coursearea(term_coursearea):
    term = term_coursearea[0]
    coursearea = term_coursearea[1]
    return coursearea, fetch_portal(term=term, coursearea=coursearea)

def fetch_portal_info():
    with Browser('chrome', headless=True) as browser:
        print('.', end='', flush=True, file=sys.stderr)
        browser.visit('https://portal.hmc.edu/ICS/default.aspx?portlet=Course_Schedules&screen=Advanced+Course+Search')
        print('.', end='', flush=True, file=sys.stderr)
        term_selector = browser.find_by_id('pg0_V_ddlTerm').first
        terms = [element.text for element in term_selector.find_by_tag('option')]
        selected_term = term_selector.find_by_css('[selected]').first.text
        coursearea_selector = browser.find_by_id('pg0_V_ddlAdditional').first
        selected_coursearea = coursearea_selector.find_by_css('[selected]').first.text
        courseareas = [element.text.strip()
                       for element in coursearea_selector.find_by_tag('option')
                       if len(element.text.strip()) > 0 and element.text != selected_coursearea]

    return selected_term, terms, courseareas

    return selected_term, terms

def fetch_portal_terms(terms):
    portal_data = {}

    pool = Pool(processes=min(len(terms), 10))
    portal_data_list = pool.map(fetch_portal_with_term, terms)

    for term, data in portal_data_list:
        portal_data[term] = data

    return portal_data

def get_portal_table(portal_html):
    soup = BeautifulSoup(portal_html, 'lxml')
    print('.', end='', flush=True, file=sys.stderr)
    return soup.select('#pg0_V_dgCourses > tbody.gbody > tr')

def can_merge(a, b, allow_substring=False):
    if isinstance(a, dict) and isinstance(b, dict):
        for key in b:
            if key in a:
                if not can_merge(a[key], b[key]):
                    return False
        return True
    elif allow_substring and isinstance(a, str) and isinstance(b, str):
        return a.startswith(b)
    else:
        return a == b

def merge_unordered_lists(a, b, allow_substring=False):
    if a == b:
        return True
    if len(a) != len(b):
        return False
    merge_map = []
    for a_itm in a:
        merge_map.append([i for i, b_itm in enumerate(b) if a_itm == b_itm])
        if len(merge_map[-1]) == 0:
            merge_map[-1] = [i for i, b_itm in enumerate(b) if not b_itm in a and can_merge(a_itm, b_itm, allow_substring)]
    idx_set = set()
    idx_list = [0]*len(a)
    a_i = 0
    if not get_merge_order(a_i, idx_list, idx_set, merge_map):
        return False
    for a_i, b_i in enumerate(idx_list):
        if isinstance(a[a_i], dict) and isinstance(b[b_i], dict):
            merge(a[a_i], b[b_i])
    return True

def get_merge_order(a_i, idx_list, idx_set, merge_map):
    if a_i == len(idx_list):
        return True
    for b_i in merge_map[a_i]:
        if b_i in idx_set:
            continue
        idx_set.add(b_i)
        idx_list[a_i] = b_i
        if get_merge_order(a_i + 1, idx_list, idx_set, merge_map):
            return True
        idx_set.remove(b_i)
    return False

def merge(a, b, path=None):
    "recursively merges two dicts, b into a"
    if path is None: path = []
    for key in b:
        if key in a:
            if isinstance(a[key], dict) and isinstance(b[key], dict):
                merge(a[key], b[key], path + [str(key)])
                continue
            if a[key] == b[key]:
                continue # same leaf value
            if isinstance(a[key], list) and isinstance(b[key], list):
                # merge scheduleparts lists by merging components
                if merge_unordered_lists(a[key], b[key], key == 'instructors'):
                    continue
            print('Error: conflict at {}: {!r} != {!r}'.format(
                        '/'.join(path + [str(key)]), a[key], b[key]), file=sys.stderr)
        else:
            a[key] = b[key]
    return a

def parse_portal_table(portal_table):
    classes = collections.OrderedDict()

    for row in portal_table:
        if (not row.has_attr('class')) or ('subItem' not in row['class']):
            section_data = parse_section(row)
            if section_data['id'] in classes and section_data['section'] in classes[class_data['id']]['sections']:
                print('Error: duplicated section {} for {}'.format(section_data['section'], class_data['id']), file=sys.stderr)
                i = 1
                while '{}.{}'.format(section_data['section'], i) in classes[class_data['id']]['sections']:
                    i += 1
                section_data['section'] = '{}.{}'.format(section_data['section'], i)
            class_data = {
                'sections': {
                    section_data['section']: section_data,
                },
                'id': section_data['id'],
                'campus': section_data['campus'],
                'name': section_data['name'],
            }
            if class_data['id'] not in classes:
                classes[class_data['id']] = {'sections': {}}
            merge(classes[class_data['id']], class_data)

    return classes

def fetch_some_portal_classes(terms):
    portal_terms = fetch_portal_terms(terms)
    classes_by_term = {}
    for term in portal_terms:
        print(term)
        classes_by_term[term] = parse_portal_table(get_portal_table(portal_terms[term]))

    return classes_by_term

CLASS_ID_RE_STR = r'''
    ^
    (?P<id>
        (?P<dept> [A-Z\ ]{4})
        (?P<number>
            (?P<number_only> [0-9]{3})
            (?P<number_extra> [A-Z0-9\ ]{2})
        )
        (?P<campus> HM|CG|CM|KG|PI|PO|PZ|SC|AA|AF|BK|CH|JM|JP|JS|JT|KS)
    )
'''
CLASS_ID_RE = re.compile(CLASS_ID_RE_STR + r'$', re.VERBOSE)
SIMPLE_CLASS_ID_RE_STR = r'''
    ^
    (?P<id>
        .*
        (?P<campus> [A-Z]{2})
    )
'''
SECTION_ID_RE_STR = r'''
    -
    (?P<section> [0-9]{2})
    $
'''
SECTION_ID_RE_ARR = [
    re.compile(CLASS_ID_RE_STR + SECTION_ID_RE_STR, re.VERBOSE),
    re.compile(SIMPLE_CLASS_ID_RE_STR + SECTION_ID_RE_STR, re.VERBOSE),
    re.compile(SIMPLE_CLASS_ID_RE_STR + r'-(?P<section> [0-9]+)$', re.VERBOSE),
    re.compile(r'^(?P<id>.*)-(?P<section> [0-9]+)$', re.VERBOSE),
]
SIMPLE_SECTION_ID_RE = re.compile(SIMPLE_CLASS_ID_RE_STR + SECTION_ID_RE_STR, re.VERBOSE)
REALLY_SIMPLE_SECTION_ID_RE = re.compile(SIMPLE_CLASS_ID_RE_STR + '-(?P<section> [0-9]+)$', re.VERBOSE)
def parse_section_id(section_id):
    for id_re in SECTION_ID_RE_ARR:
        id_match = id_re.match(section_id)
        if id_match:
            break
    else:
        print('error: no match for ' + section_id, file=sys.stderr)
        return {'id': section_id, 'section': 0, 'campus': '??'}
    id_data = id_match.groupdict()
    id_data['section'] = int(id_data['section'])
    if 'number_only' in id_data:
        id_data['number_only'] = int(id_data['number_only'])
    if 'campus' not in id_data:
        print('error: missing campus for ' + section_id, file=sys.stderr)
        id_data['campus'] = '??'
    return {'id': id_data['id'], 'campus': id_data['campus'], 'section': id_data['section'], 'id_data': id_data}

def parse_section(class_row):
    columns = list(class_row.find_all('td', recursive=False))
    class_data = {}
    
    class_data['section_id'] = str(columns[1].a.string)
    class_data.update(parse_section_id(class_data['section_id']))
    class_data['name'] = str(columns[2].string).strip()
    class_data['instructors'] = to_list(columns[3])
    enrollment_info = str(columns[4].string)
    class_data['currentEnrollment'] = int(enrollment_info.split('/')[0])
    class_data['capacity'] = int(enrollment_info.split('/')[1])
    class_data['status'] = str(columns[5].string)
    class_data['scheduleStrings'] = to_list(columns[6])
    class_data['credits'] = float(columns[7].string)
    class_data['startDate'] = reformat_date(str(columns[8].string))
    class_data['endDate'] = reformat_date(str(columns[9].string))
    class_data['schedule'] = parse_schedule(class_data['scheduleStrings'], class_data['startDate'], class_data['endDate'])

    return class_data

def to_list(cell):
    return [str(child.string).strip() for child in cell.ul.find_all('li', recursive=False)]

SCHEDULE_RE = re.compile(r'''
    ^
    (?:
        (?P<days> U?M?T?W?R?F?S?)
        \u00a0
    )?
    (?P<start> [0-9]{1,2}:[0-9]{2})
    (?P<start_ampm> [AP]M)?
    \ -\ 
    (?P<end> [0-9]{1,2}:[0-9]{2})
    \ 
    (?P<end_ampm> [AP]M)
    ;\ 
    (?P<campus> [A-Z]{2,3})?
    \ *Campus
    (?:
        ,\ *
        (?P<building> [a-zA-Z0-9.'/ -]+)
        (?:
            ,\ 
            (?P<room> [A-Z0-9]+)
        )?
    )?
    (?:
        ,?\ +\(
        (?P<start_date>
            [0-9]{1,2}/[0-9]{1,2}/[0-9]{4}
        )
        -
        (?P<end_date>
            [0-9]{1,2}/[0-9]{1,2}/[0-9]{4}
        )
        \)
    )?
    $
''', re.VERBOSE)
def parse_schedule(schedule_strings, start_date, end_date):
    schedule = []
    for timestr in schedule_strings:
        m = SCHEDULE_RE.match(timestr)
        if not m:
            print('unmatched schedule string: {}'.format(timestr), file=sys.stderr)
            timestr = timestr.replace('208', '2018')
            m = SCHEDULE_RE.match(timestr)
            if not m:
               print('still not matched', file=sys.stderr)
               schedule.append({'start_date': start_date, 'end_date': end_date})
               continue
        schedule_part = m.groupdict()
        if schedule_part['start_ampm'] is None:
            schedule_part['start_ampm'] = schedule_part['end_ampm']
        if schedule_part['days'] is None:
            if schedule_part['start'] == '0:00' and ((schedule_part['end'] == '0:00' and schedule_part['end_ampm'] == 'AM') or
                                                     (schedule_part['end'] == '12:00' and schedule_part['end_ampm'] == 'PM')):
                continue
            else:
                schedule_part['days'] = ''
        if schedule_part['start'] == '0:00' and ((schedule_part['end'] == '0:00' and schedule_part['end_ampm'] == 'AM') or
                                                     (schedule_part['end'] == '12:00' and schedule_part['end_ampm'] == 'PM')):
            schedule_part['start_time'] = None
            schedule_part['end_time'] = None
        else:
            schedule_part['start_time'] = reformat_time(schedule_part['start'], schedule_part['start_ampm'])
            schedule_part['end_time'] = reformat_time(schedule_part['end'], schedule_part['end_ampm'])
        if schedule_part['start_date'] is None:
            schedule_part['start_date'] = start_date
            schedule_part['end_date'] = end_date
        else:
            schedule_part['start_date'] = reformat_date(schedule_part['start_date'])
            schedule_part['end_date'] = reformat_date(schedule_part['end_date'])
        schedule.append(schedule_part)
    return schedule

AMPM_MAP = {'AM': 0, 'PM': 12}
def reformat_time(time_str, time_ampm):
    hour_str, minute_str = tuple(time_str.split(':'))
    time_obj = datetime.time(hour=(int(hour_str) % 12) + AMPM_MAP[time_ampm], minute=int(minute_str))
    return time_obj.isoformat()

DATE_RE = re.compile('^(?P<month>\d{1,2})/(?P<day>\d{1,2})/(?P<year>\d{4})$')
def reformat_date(date_str):
    return '{year}-{month:0>2}-{day:0>2}'.format(**DATE_RE.match(date_str).groupdict())

def fetch_portal_areamap(term, courseareas):
    areamap = {}

    pool = Pool(processes=min(len(courseareas), 10))
    portal_data_list = pool.map(fetch_portal_with_coursearea, [(term, area) for area in courseareas])

    for coursearea, data in portal_data_list:
        courses = parse_portal_table(get_portal_table(data))
        areamap[coursearea] = {course_id: [section['section_id'] for section in course['sections'].values()]
                         for course_id, course in courses.items()}
        print('.', end='', flush=True, file=sys.stderr)

    return areamap

if __name__ == '__main__':
    main()
