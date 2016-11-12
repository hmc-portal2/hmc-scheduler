var COURSE_JSON_URL = "//portal2.yancey.io/courses.json";

function lingkCallback(json) {
    // THIS FUNCTION IS CALLED BY AN IMPORTED JSON FILE
    // NEVER ELSWHERE.
    response = json["data"];
    router(response);
}

function router(response) {
    // THIS IS THE MAIN FUNCTION. ANY QUERRYING MUST BE CALLED FROM HERE.
    console.log(getCourseFromAttributeRegex(response, "courseNumber", /.*070.*/));
}
 
function getCourseSections(course) {
    return course["courseSections"];
}

function filterCoursesByCalendar(courses, calendarAttribute, expected) {
    var filteredCourses = [];
    for(course of courses) {
        var correctedCourse = JSON.parse(JSON.stringify(course));
        var sectionsForCourse = filterSectionsByCalendar(getCourseSections(course),
                calendarAttribute, expected);
        correctedCourse["courseSections"] = sectionsForCourse; 
        if(sectionsForCourse.length != 0) {
            filteredCourses.push(correctedCourse);
        }
    }
    return filteredCourses;
}

function filterSectionsByCalendar(sections, attribute, expected) {
    var filteredSections = []; // Has invalid sections removed.
    for(section of sections) {
        var correctedSection = JSON.parse(JSON.stringify(section)); // Has invalid calendar sessions removed.
        var filteredCalendarSessions = []; // Valid calendar session array.
        for(calendarSession of section["calendarSessions"]) {
            if(calendarSession[attribute] === expected) {
                filteredCalendarSessions.push(calendarSession);
            }
        }
        correctedSection["calendarSessions"] = filteredCalendarSessions;
        // If there are no calendar sections left for this section,
        // remove the section.
        if(filteredCalendarSessions.length != 0) {
            filteredSections.push(correctedSection);
        }
    }
    return filteredSections;
}

function getCoursesFromAttribute(response, attribute, expected) {
    var possibleCourses = [];
    for(key of response) {
        if(key[attribute] === expected) {
            possibleCourses.push(key);
        }
    }
    return possibleCourses;
}

function getCourseFromAttributeRegex(response, attribute, expression) {
    var possibleCourses = [];
    for(key of response) {
        if(key[attribute]) {
            console.log(key[attribute]);
            if(key[attribute].match(expression)) {
                possibleCourses.push(key);
            }
        }
    }
    return possibleCourses;
}

function attributeFilter(response, attribute, expected, mustBe) {
    var filtered = [];
    for(key in response) {
        // Push the response object to the filtered array only if
        // if has the correct attribute when we want a specific attribute,
        // or if it does not have a specific attribute.
        if((response[key][attribute] === expected && mustBe)
            || (response[key][attribute] != expected && !mustBe)) {
            filtered.push(response[key]);
        }
    }
    return filtered;
}
