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
from tqdm import tqdm

def main():
    #api_data = fetch_api_data()['data']
    #api_classes = {api_class['courseNumber']: api_class for api_class in api_data if 'courseNumber' in api_class}
    #classes_by_term, selected_term = fetch_all_portal_classes()
    with open('api.json', 'rb') as api_data_file:
        api_data = json.load(api_data_file)
    with open('portal.json', 'rb') as portal_data_file:
        portal_data = json.load(portal_data_file)
    for course in api_data:
        if 'courseNumber' not in course:
            continue
        if course['externalId'].strip() != course['courseNumber'].strip():
            print('{!r} != {!r}'.format(course['externalId'], course['courseNumber']))

ENDPOINT = 'www.lingkapis.com'
SERVICE = '/v1/harveymudd/coursecatalog/ps/datasets/coursecatalog'
QUERYSTRING = '?limit=1000000000'
MAX_RETRIES = 15

if 'KEY' in os.environ and 'SECRET' in os.environ:
    KEY = os.environ['KEY']
    SECRET = os.environ['SECRET']
else:
    print('KEY and SECRET not provided; API not available', file=sys.stderr)
    KEY = ''
    SECRET = ''

def create_signature(secret, signingStr):
    '''Creates signature for a signing string'''
    message = bytes(signingStr, 'ascii')
    secret = bytes(secret, 'ascii')
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
    connection = http.client.HTTPSConnection(endPoint)
    headers = {'Date': dateStr, 'Authorization': authorizationHeader}
    connection.request('GET', SERVICE + QUERYSTRING, headers=headers)
    response = connection.getresponse()
    return response

def fetch_api_data():
    json_err = None
    for _ in range(MAX_RETRIES):
        dateStr = datetime.datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S UTC')

        authorizationHeader = create_auth_header(KEY, SECRET, dateStr)
        res = get_HTTP_response(ENDPOINT, authorizationHeader, dateStr)
        res_data = res.read()

        try:
            json_data = json.loads(res_data)
            print('.', end='', flush=True, file=sys.stderr)
            return json_data
        except json.decoder.JSONDecodeError as e:
            # sometimes API auth is finicky; try again.
            json_err = e
            print('x', end='', flush=True, file=sys.stderr)
            continue
    print('\nError: not JSON', file=sys.stderr)
    print(res_data, file=sys.stderr)
    raise json_err

def fetch_portal(term=None, update_pb=lambda: print('.', end='', flush=True, file=sys.stderr)):
    try:
        with Browser('phantomjs') as browser:
            return fetch_portal_with_browser(browser, term, update_pb)
    except:
        print('x', end='', flush=True, file=sys.stderr)
        with Browser('chrome', headless=True) as browser:
            return fetch_portal_with_browser(browser, term, update_pb)

def fetch_portal_with_browser(browser, term, update_pb):
    update_pb()
    browser.visit('https://portal.hmc.edu/ICS/default.aspx?portlet=Course_Schedules&screen=Advanced+Course+Search')
    update_pb()
    if term is not None:
        term_selector = browser.find_by_id('pg0_V_ddlTerm').first
        selected_term = term_selector.find_by_css('[selected]').first.text
        if term.replace(' ', '') != selected_term.replace(' ', ''):
            term_selector.select_by_text(term)
    update_pb()
    browser.fill('pg0$V$txtCourseRestrictor', '*')
    browser.click_link_by_id('pg0_V_btnSearch')
    update_pb()
    if len(browser.find_by_id('pg0_V_lnkShowAll')) > 0:
        browser.click_link_by_id('pg0_V_lnkShowAll')
    update_pb()
    return browser.html

def fetch_portal_with_term(term):
    return term, fetch_portal(term)

def fetch_all_portal_terms():
    with Browser('phantomjs') as browser:
        print('.', end='', flush=True, file=sys.stderr)
        browser.visit('https://portal.hmc.edu/ICS/default.aspx?portlet=Course_Schedules&screen=Advanced+Course+Search')
        print('.', end='', flush=True, file=sys.stderr)
        term_selector = browser.find_by_id('pg0_V_ddlTerm').first
        terms = [element.text for element in term_selector.find_by_tag('option')]
        selected_term = term_selector.find_by_css('[selected]').first.text

    portal_data = {}

    pool = Pool(processes=min(len(terms), 20))
    portal_data_list = pool.map(fetch_portal_with_term, terms)

    for term, data in portal_data_list:
        portal_data[term] = data

    return portal_data, selected_term

def get_portal_table(portal_html):
    soup = BeautifulSoup(portal_html, 'lxml')
    print('.', end='', flush=True, file=sys.stderr)
    return soup.select('#pg0_V_dgCourses > tbody.gbody > tr')

def merge(a, b, path=None):
    "recursively merges two dicts, b into a"
    if path is None: path = []
    for key in b:
        if key in a:
            if isinstance(a[key], dict) and isinstance(b[key], dict):
                merge(a[key], b[key], path + [str(key)])
            elif a[key] == b[key]:
                pass # same leaf value
            else:
                raise Exception('Conflict at %s' % '.'.join(path + [str(key)]))
        else:
            a[key] = b[key]
    return a

def parse_portal_table(portal_table):
    classes = {}

    for row in portal_table:
        if (not row.has_attr('class')) or ('subItem' not in row['class']):
            section_data = parse_section(row)
            class_data = {
                'sections': {
                    section_data['section']: section_data,
                },
                'id': section_data['id'],
                'campus': section_data['campus'],
                'name': section_data['name'],
            }
            if class_data['id'] not in classes:
                classes[class_data['id']] = {}
            merge(classes[class_data['id']], class_data)

    return classes

def fetch_all_portal_classes():
    portal_terms, selected_term = fetch_all_portal_terms()
    classes_by_term = {}
    for term in portal_terms:
        classes_by_term[term] = parse_portal_table(get_portal_table(portal_terms[term]))

    return classes_by_term, selected_term

def fetch_portal_classes():
    return parse_portal_table(get_portal_table(fetch_portal()))

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
        schedule_part = m.groupdict()
        if schedule_part['start_ampm'] is None:
            schedule_part['start_ampm'] = schedule_part['end_ampm']
        if schedule_part['days'] is None:
            if schedule_part['start'] == '0:00' and ((schedule_part['end'] == '0:00' and schedule_part['end_ampm'] == 'AM') or
                                                     (schedule_part['end'] == '12:00' and schedule_part['end_ampm'] == 'PM')):
                continue
            else:
                schedule_part['days'] = ''
        if schedule_part['start_date'] is None:
            schedule_part['start_date'] = start_date
            schedule_part['end_date'] = end_date
        else:
            schedule_part['start_date'] = reformat_date(schedule_part['start_date'])
            schedule_part['end_date'] = reformat_date(schedule_part['end_date'])
        schedule.append(schedule_part)
    return schedule

DATE_RE = re.compile('^(?P<month>\d{1,2})/(?P<day>\d{1,2})/(?P<year>\d{4})$')
def reformat_date(date_str):
    return '{year}-{month:0>2}-{day:0>2}'.format(**DATE_RE.match(date_str).groupdict())

if __name__ == '__main__':
    main()
