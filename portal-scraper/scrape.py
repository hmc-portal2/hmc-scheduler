from splinter import Browser
from bs4 import BeautifulSoup
import json
import re

def main():
    with Browser('phantomjs') as browser:
        browser.visit('https://portal.hmc.edu/ICS/Portal_Homepage.jnz?portlet=Course_Schedules')
        print('.', end='', flush=True)
        browser.fill('pg0$V$tabSearch$txtCourseRestrictor', '*')
        browser.click_link_by_id('pg0_V_tabSearch_btnSearch')
        print('.', end='', flush=True)
        browser.click_link_by_id('pg0_V_lnkShowAll')
        print('.', end='', flush=True)
        page_html = browser.html

    soup = BeautifulSoup(page_html, 'lxml')
    print('.', flush=True)
    table = soup.select('#pg0_V_dgCourses > tbody.gbody > tr')

    classes = []

    for row in table:
        if (not row.has_attr('class')) or ('subItem' not in row['class']):
            class_data = parse_class(row)
            classes[class_data['id']] = class_data

    print(json.dumps(classes[1366], sort_keys=True, indent=4))

def parse_class(class_row):
    columns = list(class_row.find_all('td', recursive=False))
    class_data = {}
    
    class_data['id'] = str(columns[1].a.string)
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
    class_data['schedule'] = parse_schedule(class_data['scheduleStrings'])

    return class_data

def to_list(cell):
    return [str(child.string).strip() for child in cell.ul.find_all('li', recursive=False)]

def parse_schedule(schedule_strings):
    return {}

DATE_RE = re.compile('^(?P<month>\d{2})/(?P<day>\d{2})/(?P<year>\d{4})$')
def reformat_date(date_str):
    return '{year}-{month}-{day}'.format(**DATE_RE.match(date_str).groupdict())

if __name__ == '__main__':
    main()
