var globalCourseData = {};
var globalCourseSearch = [];
var globalCourses;
var globalFavCourses;
var globalTerm;
var globalShowMoreIndex;
var globalCourseAreas = {};

fetch('/data/main.json').then(function(response){
  return response.json();
}).then(function(json) {
  globalTerm = json['selected'];
  globalCourseData[globalTerm] = json['selected_data'];
  createDropdownBlock("Course Term:", "course-terms", globalTerm);
  createDropdownBlock("Course Area:", "course-areas", "All");
  var terms = json['terms']; // TODO: implement all
  var areas = json['areas'];
  areas.unshift("All")
  createDropdown("#course-terms", terms);
  createDropdown("#course-areas", areas);
  $(".dropdown-menu li a").click(function() {
    $(this).parents(".dropdown").find(".btn").html($(this).text() + getCaret());
    $(this).parents(".dropdown").find(".btn").attr('realVal', $(this).text());
    updateSearch();
  })
  fetchCourseAreas();
  //getAllDepartments();
  addExtraAttributes();
  updateSearch();
})

function fetchCourseAreas() {
  term = globalTerm;
  if(!(term in globalCourseAreas)) {
    fetch('/data/'+term+'_infomap.json').then(function(response) {
      return response.json();
    }).then(function(json){
      globalCourseAreas[term] = json;
      area = $("#course-areas_btn").attr('realVal');
      if(area != "All") updateSearch();
    })
  }
}

function getAllDepartments() {
  var depts = {};
  for (key of globalCourseData) {
    //TODO: Get rid of this later
    var dept = "";
    if (key['departments']) {
      jQuery.each(key['departments'], function() {
        if (this['Name']) {
          dept += this['Name'] + ' ';
        }
      })
      if (!(dept in depts)) {
        depts[dept] = 1;
      } else {
        depts[dept] = depts[dept] + 1;
      }
    }
  }
}



function addExtraAttributes() {
  for (var id in globalCourseData[globalTerm]) {
    key = globalCourseData[globalTerm][id]
    //Add the campus the course is on to its attributes
    //Currently, courses which are jointly taught (JT) will not show up no matter which college you select.
    var courseCode = id.slice(-2);
    var college = "";
    switch (courseCode) {
      case 'HM':
        college = "Harvey Mudd";
        break;
      case 'CG':
        college = "Claremont Graduate University";
        break;
      case 'CM':
        college = "Claremont McKenna";
        break;
      case 'SC':
        college = "Scripps";
        break;
      case 'PO':
        college = "Pomona";
        break;
      case 'PZ':
        college = "Pitzer";
        break;
      case 'KS':
        college = "Keck Science";
        break;
      case 'JM':
        college = "Joint Music";
        break;
      case 'JP':
        college = "CMS PE";
        break;
      default:
        college = "Other";
        break;
    }
    key.campus = college;
    // Add its filled status (whether or not there are empty seats left)
    // Currently, full is false if there is even 1 unfilled section

    // Default: starts out as true (and will remain that way if there is no data on fullness)
    //sectionTimeMap = {};
    for (var i in key['sections']) {
      section = key['sections'][i];
      //var term = session['designator'];
      var full = true;
      if (section['capacity'] && section['currentEnrollment'] && (section['currentEnrollment'] < section['capacity'])) {
        full = false;
      } 
      section.full = full;
    }
  }
}




function updateSearch() {
  globalTerm = $("#course-terms_btn").attr('realVal');
  if (!globalTerm) {
    return;
  }
  if (globalTerm == 'All') {
    globalTerm = "";
  } else {
    if(!(globalTerm in globalCourseData)) {
      fetchCourseAreas();
      globalCourseData[globalTerm] = null;
      term = globalTerm
      fetch('/data/' + term + '.json').then(function(response){
        return response.json();
      }).then(function(json) {
        globalCourseData[term] = json
      }).then(updateSearch);
      return
    } else if(globalCourseData[globalTerm] == null) {
      return
    }
  }
  var code = document.getElementById("course-code").value;
  var title = document.getElementById("course-title").value;
  var useTitleRegex = document.getElementById("title-regex").checked;
  var useCodeRegex = document.getElementById("code-regex").checked;
  var instructor = document.getElementById("instructor").value;
  var useInstructorRegex = document.getElementById("prof-regex").checked;
  var campus = $("#campus_btn").attr('realVal') || false;
  var coursearea = $("#course-areas_btn").attr('realVal') || false;
  var filled = document.getElementById("filled-regex").checked;
  var department = $("#department_btn").attr('realVal') || false;
  if (campus === "All") {
    campus = false;
  }
  if (department === "All") {
    department = false;
  }


  // Implement title, code, and instructor regex
  var titleRe = implementRegex(useTitleRegex, title);
  var codeRe = implementRegex(useCodeRegex, code);
  var instructorRe = implementRegex(useInstructorRegex, instructor);

  validCourses = []
  for(var id in globalCourseData[globalTerm]) {
    validCourses.push(globalCourseData[globalTerm][id])
  }
  validCourses = getCoursesFromAttributeRegex(validCourses, "name", titleRe);
  validCourses = getCoursesFromAttributeRegex(validCourses, "id", codeRe);
  validCourses = getInstructorRegex(validCourses, instructorRe);
  if (campus != false) {
    validCourses = getCoursesFromAttribute(validCourses, "campus", campus);
  }
  if (filled) {
    validCourses = getCoursesFilled(validCourses);
  }
  if (department != false) {
    validCourses = getCoursesFromDept(validCourses, department);
  }

  if (coursearea != "All" && term in globalCourseAreas) {
    validCourses = getCoursesFromArea(validCourses, coursearea);
  }

//   if (globalTerm != "") {
//     validCourses = filterCoursesByCalendar(validCourses, "designator", globalTerm);
//   }
  globalCourseSearch = validCourses;
  repopulateChart();
}



function implementRegex(useRegex, term) {
  if (!useRegex) { //TODO: Why did we get rid of the excalmation point... used to be (!useRegex)
    term = term.replace(/[\-\[\]\/\{\}\(\)\+\.\\\^\$\|]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\s+/g, "\\s+");
    return RegExp(".*" + term + ".*", "i");
  } else {
    return RegExp(term, "i");
  }
}



function toAmPmTime(timestring) {
  if (timestring.length === 3) {
    timestring = '0' + timestring;
  }
  hours = timestring.substring(0, 2);
  ispm = hours > 12;
  if (ispm) hours = '' + (hours - 12);
  if (hours.length === 1) {
    hours = '0' + hours;
  }
  minutes = timestring.substring(2, 4);
  return hours + ':' + minutes + (ispm ? 'PM' : 'AM');
}

function toCourseObject(courseJson) {
  var courseName = courseJson['name'];
  var timeslots = '';
  var isfirsttimeslot = true;
  for (var sectionId in courseJson['sections']) {
    section = courseJson['sections'][sectionId]
    if (!isfirsttimeslot) {
      timeslots += '\n';
    }
    var instructorName = '';
    if (section['instructors'] && section['instructors'].length > 0) {
      var instructor = section['instructors'][0];
      instructorName = instructor.split(',')[0];
    } else {
      instructorName = 'Unknown';
    }
    var timeslot = '';
    timeslot += section['section_id'];
    timeslot += ' (';
    timeslot += instructorName;
    timeslot += '): ';
    var isFirstTime = true;
    for (var schedule of section['schedule']) {
      if (!isFirstTime) {
        timeslot += ', ';
      }
      isFirstTime = false;
      timeslot += schedule['days'];
      timeslot += ' ';
      timeslot += schedule['start'] + schedule['start_ampm'];
      timeslot += '-';
      timeslot += schedule['end'] + schedule['end_ampm'];
      timeslot += '; ';
      timeslot += schedule['site'];
    }
    timeslots += timeslot;
    isfirsttimeslot = false;
  }
  return {
    name: courseName,
    times: timeslots,
    selected: true,
    data: courseJson
  };
}

var options = {
  'showSections': false,
  'allowConflicts': false
};

function randomColor(seed) {
  if (!seed)
    seed = '' + Math.random();

  // Use a hash function (djb2) to generate a deterministic but "random" color.
  var hash = 5381 % 359;
  for (var i = 0; i < seed.length; i++)
    hash = (((hash << 5) + hash) + seed.charCodeAt(i)) % 359;

  return 'hsl(' + hash + ', 73%, 90%)'
    // Even though we should use "% 360" for all possible values, using 359 makes for fewer hash collisions.
}

var openNode = false;
var tabIndex = 0;

function addCourse(course, courses, favoriteCourses, fc) {

  // Make a new course node
  var courseNode = document.getElementById('course-template').cloneNode(true);
  courseNode.classList.remove('template');
  course._node = courseNode;
  course._node.toJSON = function() {
    return undefined;
  };

  // Fill in the values
  if (course.name) courseNode.querySelector('input[type="text"]').value = course.name;
  courseNode.querySelector('input[type="checkbox"]').checked = course.selected;
  if (course.times) courseNode.querySelector('textarea').value = course.times;
  courseNode.querySelector('input[type="text"]').style.backgroundColor = course.color || randomColor(course.name);

  // Collapsing and expanding
  courseNode.querySelector('input[type="text"]').onfocus = function() {
    if (openNode && openNode != courseNode)
      openNode.classList.add('collapsed');
    openNode = courseNode;
    openNode.classList.remove('collapsed');
  };
  /*courseNode.querySelector('input[type="text"]').ondblclick = function () {
    openNode.classList.add('collapsed');
    openNode = false;
  };*/

  // Data updating
  courseNode.querySelector('input[type="text"]').onchange = function() {
    course.name = this.value;

    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
  };
  courseNode.querySelector('textarea').onchange = function() {
    course.times = this.value.trim();

    // Add a trailing line break to facilitate copy/paste
    if (this.value[this.value.length - 1] != '\n')
      this.value += '\n';

    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
  };
  courseNode.querySelector('input[type="checkbox"]').onchange = function() {
    course.selected = !!this.checked;
    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
  };

  // Tabbing
  courseNode.querySelector('input[type="text"]').setAttribute('tabindex', ++tabIndex);
  courseNode.querySelector('textarea').setAttribute('tabindex', ++tabIndex);

  // Deleting
  courseNode.querySelector('.x').onclick = function() {
    if (confirm('Are you sure you want to delete ' + (course.name || 'this class') + '?')) {
      courses.splice(courses.indexOf(course), 1);
      courseNode.parentNode.removeChild(courseNode);
      save('courses', courses);
      document.getElementById('button-generate').disabled = false;

      if (courses.length == 0) {
        document.getElementById('courses-container').classList.add('empty');
        document.getElementById('courses-container').classList.remove('not-empty');
      }
    }
    return false;
  };

  // Change colors
  courseNode.querySelector('.c').onclick = function() {
    var color = course.color || randomColor(course.name);
    courseNode.querySelector('input[type="text"]').style.backgroundColor = course.color = color.replace(/\d+/, function(hue) {
      return (+hue + 24) % 360;
    });
    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
    return false;
  };

  if (fc) {
    courseNode.getElementsByClassName('atf')[0].style = 'display: none;';
    courseNode.getElementsByClassName('fta')[0].style = '';

    document.getElementById('favorite-courses').appendChild(courseNode);
    document.getElementById('favorite-courses-container').classList.remove('empty');
    document.getElementById('favorite-courses-container').classList.add('not-empty');
  } else {
    document.getElementById('courses').appendChild(courseNode);
    document.getElementById('courses-container').classList.remove('empty');
    document.getElementById('courses-container').classList.add('not-empty');

    document.getElementById('button-generate').disabled = false;
  }
}

function timeToHours(h, m, pm) {
  return h + m / 60 + (pm && h != 12 ? 12 : 0);
}

function formatHours(hours) {
  var h = Math.floor(hours) % 12 || 12;
  var m = Math.round((hours % 1) * 60);
  return h + ':' + ('0' + m).substr(-2) + (hours >= 12 ? 'pm' : 'am');
}

function loadSchedule(schedules, i) {

  i = Math.min(schedules.length - 1, Math.max(i, 0));

  // Some UI
  document.getElementById('button-left').disabled = i <= 0;
  document.getElementById('button-right').disabled = i + 1 >= schedules.length;
  document.getElementById('page-number').innerHTML = i + 1;
  document.getElementById('page-count').innerHTML = schedules.length;
  document.getElementById('button-save').disabled = schedules.length == 0;
  document.getElementById('button-export').disabled = schedules.length == 0;
  document.getElementById('button-print').disabled = schedules.length == 0;

  document.getElementById('page-counter').classList.add(schedules.length ? 'not-empty' : 'empty');
  document.getElementById('page-counter').classList.remove(schedules.length ? 'empty' : 'not-empty');

  setCreditCounter(schedules[i] || []);

  drawSchedule(schedules[i] || []);
  return i;
}

function setCreditCounter(schedule) {
  var seenSoFar = new Set();
  var count = schedule.filter(function(timeSlot) {
    if (seenSoFar.has(timeSlot.section)) return false;
    seenSoFar.add(timeSlot.section);
    return true;
  }).map(function(course) {
    if (!course.sectionData || !('credits' in course.sectionData))
      return NaN;

    switch(course.sectionData['campus']) {
      case 'HM':
        // Mudd courses are worth their full value.
        return course.sectionData['credits'];
      case 'JM':
        // Joint music courses seems to be halved?
        return course.sectionData['credits'] * 2;
      default:
        // Other colleges' courses need to be multiplied by three.
        return course.sectionData['credits'] * 3;
    }
  }).reduce(function(a, b) {
    return a + b;
  }, 0);
  document.getElementById('credit-counter').innerHTML = isNaN(count) ? '' : '(' + count.toFixed(1) + ' credits)';
}

function drawSchedule(schedule) {
  var days = Array.prototype.slice.call(document.querySelectorAll('.day'));
  var beginHour = 8 - 0.5; // Starts at 8am
  var hourHeight = document.querySelector('#schedule li').offsetHeight;

  // Clear the schedule
  days.forEach(function(day) {
    while (day.firstChild)
      day.removeChild(day.firstChild);
  });

  // Add each time slot
  schedule.forEach(function(timeSlot) {
    var div = document.createElement('div');
    div.classList.add('classDiv')
    div.style.top = hourHeight * (timeSlot.from - beginHour) + 'px';
    div.style.setProperty('background-color', 'unset');
    var bgColor = timeSlot.course.color || randomColor(timeSlot.course.name);
    // this way, color is maintained even when printing
    div.style.setProperty('box-shadow', 'inset 0 0 0 1000px '+bgColor, 'important')
    //div.style.setProperty('background-color', bgColor, 'important');
    div.innerHTML = (options.showSections && timeSlot.section ?
        timeSlot.section.replace(/^([^(]+)\((.*)\)/, function(_, code, profs) {
          return '<b>' + code + '</b><br />' + profs;
        }) :
        '<b>' + timeSlot.course.name + '</b>') +
      '<br />' + formatHours(timeSlot.from) + ' - ' + formatHours(timeSlot.to);

    days[timeSlot.weekday].appendChild(div);

    // Vertically center
    var supposedHeight = (timeSlot.to - timeSlot.from) * hourHeight;
    var paddingHeight = (supposedHeight - div.offsetHeight) / 2;
    div.style.padding = paddingHeight + 'px 0';
    div.style.height = (supposedHeight /*- paddingHeight * 2*/ ) + 'px';
  });
}

function addSavedSchedule(name, schedule, savedSchedules) {
  var div = document.createElement('div');

  var scheduleLink = document.createElement('a');
  scheduleLink.href = '#';
  scheduleLink.onclick = function() {
    drawSchedule(schedule);
    document.getElementById('button-generate').disabled = false;
    return false;
  };
  scheduleLink.appendChild(document.createTextNode(name));

  var removeLink = document.createElement('a');
  removeLink.href = '#';
  removeLink.className = 'x';
  removeLink.onclick = function() {
    if (confirm('Are you sure you want to delete this saved schedule?')) {
      div.parentNode.removeChild(div);
      delete savedSchedules[name];

      if (document.getElementById('saved-schedules').children.length == 0) {
        document.getElementById('saved-schedules-container').classList.add('empty');
        document.getElementById('saved-schedules-container').classList.remove('not-empty');
      }

      save('savedSchedules', savedSchedules);
    }
    return false;
  };
  removeLink.appendChild(document.createTextNode('x'));

  div.appendChild(scheduleLink);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(removeLink);

  document.getElementById('saved-schedules-container').classList.remove('empty');
  document.getElementById('saved-schedules-container').classList.add('not-empty');
  document.getElementById('saved-schedules').appendChild(div);
}

function download(filename, text) {
  var a = document.createElement('a');
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
  a.download = filename;

  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportSchedule(mapOfCourses) {
  var header = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//HMC Scheduler//EN\n';
  var footer = 'END:VCALENDAR\n';
  var result = '';
  result += header;
  for (i in mapOfCourses) {
    var vevent = new VEventObject(mapOfCourses[i]);
    result += vevent.toString();
  }
  result += footer;
  return result;
}

function padZero(n, pad) {
  var s = '' + n;
  while (s.length < pad)
    s = '0' + s;
  return s;
}

function formatDate(date) {
  return [
    padZero(date.getFullYear(), 4),
    padZero(date.getMonth() + 1, 2),
    padZero(date.getDate(), 2),
    'T',
    padZero(date.getHours(), 2),
    padZero(date.getMinutes(), 2),
    padZero(date.getSeconds(), 2)
  ].join('');
}

function VEventObject(timeBlocks) {
  this.weekdays = [];
  for (i in timeBlocks) {
    this.weekdays.push(timeBlocks[i].weekday);
  }
  this.startTime = timeBlocks[0].from;
  this.endTime = timeBlocks[0].to;

  this.startDate = new Date(Date.parse(timeBlocks[0].sectionData.startDate));

  // Update the start date of the class to the first day where there is
  // actually a class (according to the MTWRF flags)
  var startDay = this.startDate.getDay();
  var daysTillClasses = this.weekdays.map(function(weekday) {
    var day = weekday + 1;
    return (7 + day - startDay) % 7;
  });
  var daysTillFirstClass = Math.min.apply(null, daysTillClasses);
  this.startDate.setDate(this.startDate.getDate() + daysTillFirstClass);

  this.endDate = new Date(Date.parse(timeBlocks[0].sectionData.endDate));
  this.name = timeBlocks[0].course.name;
  this.loc = timeBlocks[0].loc;
  this.toString = function() {
    var days = ['MO', 'TU', 'WE', 'TH', 'FR'];
    var startDateFull = dateAddHoursAndMinutes(this.startDate, this.startTime);
    var endDateFull = dateAddHoursAndMinutes(this.startDate, this.endTime); //no "overnight" classes
    var header = 'BEGIN:VEVENT\n';
    var footer = 'END:VEVENT\n';
    var uid = 'UID:' + this.startDate + this.startTime + '-' + (new Date()).getTime() + '\n';
    var dtstart = 'DTSTART:' + formatDate(startDateFull) + '\n';
    var dtend = 'DTEND:' + formatDate(endDateFull) + '\n';
    var dtstamp = 'DTSTAMP:' + formatDate(new Date()) + '\n';
    var place = 'LOCATION:' + this.loc.replace(/,/g, '\\,').replace(/\n/g, '') + '\n';
    var rrule = 'RRULE:FREQ=WEEKLY;BYDAY=' + this.weekdays.map(function(day) {
      return days[day];
    }).join(',') + ';UNTIL=' + formatDate(this.endDate) + '\n';
    var title = 'SUMMARY:' + this.name.replace(/,/g, '\\,') + '\n';
    return header + uid + dtstart + dtend + dtstamp + place + rrule + title + footer;
  };
}

function dateAddHoursAndMinutes(date, fracHours) {
  var hours = Math.floor(fracHours);
  var minutes = (fracHours - hours) * 60;
  var newDate = new Date(date);
  newDate.setHours(hours);
  newDate.setMinutes(minutes);
  return newDate;
}

function mapCourses(schedules) {
  var mapOfCourses = {};
  for (var i = 0; i < schedules.length; i++) {
    var timeBlock = schedules[i];
    var key = timeBlock.course.name + timeBlock.loc + (' ' + timeBlock.from + ' ' + timeBlock.to);
    if (!mapOfCourses[key])
      mapOfCourses[key] = [];
    mapOfCourses[key].push(timeBlock);
  }
  return mapOfCourses;
}

function generateSchedules(courses) {
  // Parse all the courses from text form into a list of courses, each a list of time slots
  var classes = courses.filter(function(course) {
    return course.selected && course.times;
  }).map(function(course) {
    // Parse every line separately
    return course.times.split('\n').map(function(timeSlot, index) {

      // Extract the section info from the string, if it's there.
      var section = timeSlot.indexOf(': ') > -1 ? timeSlot.split(': ')[0] : '';
      var sectionNumber = parseInt(section.slice(12,14)); // courseids are a fixed length

      var sectionData = course.data && section? course.data.sections[sectionNumber]: null;
      // Split it into a list of each day's time slot
      var args = [];
      // The lookahead at the end is because meeting times are delimited by commas (oops), but the location may contain commas.
      timeSlot.replace(/([MTWRF]+) (\d?\d):(\d\d)\s*(AM|PM)?\s*\-\s?(\d?\d):(\d\d)\s*(AM|PM)?;([^;]*?)(?=$|, \w+ \d?\d:\d{2})/gi, function(_, daylist, h1, m1, pm1, h2, m2, pm2, loc) {
        daylist.split('').forEach(function(day) {
          args.push({
            'course': course,
            'section': section,
            'sectionData': sectionData,
            'loc': loc.trim(),
            'weekday': 'MTWRF'.indexOf(day),
            'from': timeToHours(+h1, +m1, (pm1 || pm2).toUpperCase() == 'PM'),
            'to': timeToHours(+h2, +m2, (pm2 || pm1).toUpperCase() == 'PM'),
          });
        });
      });
      return args;

    });
  });

  // Generate all possible combinations
  var combos = [];
  var state = classes.map(function() {
    return 0;
  }); // Array of the same length
  while (true) {

    // Add this possibility
    combos.push(classes.map(function(course, i) {
      return course[state[i]];
    }));

    // Increment state
    var incremented = false;
    for (var i = 0; i < classes.length; i++) {
      if (state[i] < classes[i].length - 1) {
        state[i]++;
        incremented = true;
        break;
      } else
        state[i] = 0;
    }

    // We're done.
    if (!incremented)
      break;
  }
  // Concatenate all the timeslots
  var concatted = combos.map(function(combo) {
    return Array.prototype.concat.apply([], combo);
  });


  // And remove conflicting schedules
  return options.allowConflicts ? concatted : concatted.filter(function(timeSlots) {
    // Loop over every six minute interval and make sure no two classes occupy it
    for (var day = 0; day < 5; day++) {

      var todaySlots = timeSlots.filter(function(timeSlot) {
        return timeSlot.weekday == day;
      });
      for (var t = 0; t < 24; t += 0.1) {
        var classesThen = todaySlots.filter(function(timeSlot) {
          return timeSlot.from < t && t < timeSlot.to;
        });
        var uniqueClassesThen = unique_classes(classesThen);
        if (uniqueClassesThen.length > 1) {
          // check to see if their dates are all disjoint
          for(var i = 0; i < uniqueClassesThen.length-1; i++) {
            for(var j = i+1; j < uniqueClassesThen.length; j++) {
              if(sectionDatesOverlap(uniqueClassesThen[i]['sectionData'], uniqueClassesThen[j]['sectionData'])) {
                return false;
              }
            }
          }
          return true;
        }
      }
    }

    return true;
  });
}

function sectionDatesOverlap(sectionData_a, sectionData_b) {
  a_start = new Date(sectionData_a['startDate'])
  a_end = new Date(sectionData_a['endDate'])
  b_start = new Date(sectionData_b['startDate'])
  b_end = new Date(sectionData_b['endDate'])
  if (a_start <= b_start && b_start <= a_end) return true; // b starts in a
  if (a_start <= b_end   && b_end   <= a_end) return true; // b ends in a
  if (b_start <  a_start && a_end   <  b_end) return true; // a in b
  if (a_start == b_start && a_end   == b_end) return true; // a is b
  return false;
}

// This function takes a list of courses and reduces it - removing any
// two timeSlots that have the same course name
function unique_classes(timeSlots) {
  slots = []
  alreadyAdded = {}
  for (slotIdx in timeSlots) {
    var timeSlot = timeSlots[slotIdx];
    if (!(timeSlot.course.name in alreadyAdded)) {
      slots.push(timeSlot);
      alreadyAdded[timeSlot.course.name] = true;
    }
  }
  return slots;
}

// Store stuff
var lastModified = localStorage.lastModified;

function save(type, arr) {

  if (localStorage.lastModified != lastModified)
    if (!confirm('It looks like the data has been modified from another window. Do you want to overwrite those changes? If not, refresh this page to update its data.')) {
      return;
    }

  lastModified = localStorage.lastModified = Date.now();
  localStorage[type] = JSON.stringify(arr);
}




function messageOnce(str) {
  if (localStorage['message_' + str])
    return false;

  localStorage['message_' + str] = true;
  return true;
}

(function() {
  // Load data
  var courses = localStorage.courses ? JSON.parse(localStorage.courses) : [];
  var favoriteCourses = localStorage.favoriteCourses ? JSON.parse(localStorage.favoriteCourses) : [];
  globalCourses = courses;
  globalFavCourses = favoriteCourses;
  var savedSchedules = localStorage.savedSchedules ? JSON.parse(localStorage.savedSchedules) : {};
  var schedules = [];
  var schedulePosition = 0;

  // Attach events
  /*document.getElementById('button-add').onclick = function () {
    var course = {
      'name': '',
      'selected': true,
      'times': ''
    };
    courses.push(course);
    addCourse(course, courses, favoriteCourses);
    save('courses', courses);
  };*/

  document.getElementById('button-save').onclick = function() {
    var name = prompt('What would you like to call this schedule?', '');
    if (name) {
      savedSchedules[name] = JSON.parse(JSON.stringify(schedules[schedulePosition]));
      addSavedSchedule(name, savedSchedules[name], savedSchedules);
      save('savedSchedules', savedSchedules);
    }
  };

  document.getElementById('button-generate').onclick = function() {
    schedules = generateSchedules(courses);

    // Display them all
    schedulePosition = loadSchedule(schedules, 0);
    console.log(schedules, schedulePosition);
    this.disabled = true;
  };

  document.getElementById('button-sections').checked = options.showSections = localStorage.showSections;
  document.getElementById('button-sections').onclick = function() {
    localStorage.showSections = options.showSections = this.checked;
    document.getElementById('button-generate').onclick();
  };

  document.getElementById('button-conflicts').checked = options.allowConflicts = localStorage.allowConflicts;
  document.getElementById('button-conflicts').onclick = function() {
    localStorage.allowConflicts = options.allowConflicts = this.checked;
    document.getElementById('button-generate').onclick();
  };

  // Navigating schedules
  document.getElementById('button-left').onclick = function() {
    schedulePosition = loadSchedule(schedules, schedulePosition - 1);
  };
  document.getElementById('button-right').onclick = function() {
    schedulePosition = loadSchedule(schedules, schedulePosition + 1);
    this.classList.add('clicked');
  };
  document.onkeydown = function(e) {
    if (e.keyCode == 39)
      document.getElementById('button-right').onclick();
    else if (e.keyCode == 37)
      document.getElementById('button-left').onclick();
  };

  // Display all the courses
  if (courses.length) {
    for (var i = 0; i < courses.length; i++) {
      addCourse(courses[i], courses, favoriteCourses, false);
    }
    document.getElementById('button-generate').onclick();
  }

  // Display all the favorite courses
  if (favoriteCourses.length) {
    for (var i = 0; i < favoriteCourses.length; i++) {
      addCourse(favoriteCourses[i], courses, favoriteCourses, true);
    }
    document.getElementById('button-generate').onclick();
  }

  // Display all the saved schedules
  for (var name in savedSchedules)
    addSavedSchedule(name, savedSchedules[name], savedSchedules);

  // Sigh, browser detection
  var detection = {
    'chrome': !!window.chrome,
    'webkit': navigator.userAgent.toLowerCase().indexOf('safari') > -1,
    'firefox': navigator.userAgent.toLowerCase().indexOf('firefox') > -1,
    'mac': navigator.userAgent.toLowerCase().indexOf('mac os') > -1
  };

  // Firefox printing is ugly
  if (detection['firefox'])
    document.getElementById('button-print').style.display = 'none';

  document.getElementById('button-print').onclick = function() {
    if (detection['chrome'] && messageOnce('print-tip'))
      alert('Pro-tip: Chrome has an option on the Print dialog to disable Headers and Footers, which makes for a prettier schedule!');
    window.print();
  };

  document.getElementById('button-clear').onclick = function() {
    if (confirm('Are you sure you want to delete all the courses you\'ve added?')) {
      save('courses', courses = []);
      save('favoriteCourses', favoriteCourses = []);
      window.location.reload();
    }

    return false;
  };

  document.getElementById('button-export').onclick = function() {
    var mapOfCourses = mapCourses(schedules[schedulePosition]);

    var scheduleText = exportSchedule(mapOfCourses);
    download("schedule.ics", scheduleText);
  };
  // Silly workaround to circumvent crossdomain policy
  if (window.opener)
    window.opener.postMessage('loaded', '*');
}());


///////////////////// START PARSER /////////////////////////////////////

function getCourseSections(course) {
  return course["courseSections"];
}

function filterCoursesByCalendar(courses, calendarAttribute, expected) {
  var filteredCourses = [];
  for (course of courses) {
    var correctedCourse = JSON.parse(JSON.stringify(course));
    var sectionsForCourse = filterSectionsByCalendar(getCourseSections(course),
      calendarAttribute, expected);
    correctedCourse["courseSections"] = sectionsForCourse;
    if (sectionsForCourse.length != 0) {
      filteredCourses.push(correctedCourse);
    }
  }
  return filteredCourses;
}

function filterSectionsByCalendar(sections, attribute, expected) {
  var filteredSections = []; // Has invalid sections removed.
  for (section of sections) {
    var correctedSection = JSON.parse(JSON.stringify(section)); // Has invalid calendar sessions removed.
    var filteredCalendarSessions = []; // Valid calendar session array.
    if(!section['calendarSessions']) continue;
    for (calendarSession of section["calendarSessions"]) {
      if (calendarSession[attribute].startsWith(expected)) {
        filteredCalendarSessions.push(calendarSession);
      }
    }
    correctedSection["calendarSessions"] = filteredCalendarSessions;
    // If there are no calendar sections left for this section,
    // remove the section.
    if (filteredCalendarSessions.length != 0) {
      filteredSections.push(correctedSection);
    }
  }
  return filteredSections;
}

function getCoursesFromAttribute(response, attribute, expected) {
  var possibleCourses = [];
  for (key of response) {
    if (key[attribute] === expected) {
      possibleCourses.push(key);
    }
  }
  return possibleCourses;
}

function getCoursesFromAttributeRegex(response, attribute, expression) {
  var possibleCourses = [];
  for (key of response) {
    if (key[attribute]) {
      if (key[attribute].match(expression)) {
        possibleCourses.push(key);
      }
    }
  }
  return possibleCourses;
}



function getInstructorRegex(response, expression) {
  var possibleCourses = [];
  for (key of response) {
    if (key['sections']) {
      var allSections = key['sections'];
      var addIt = false;
      for (sectionId in allSections) {
        section = allSections[sectionId]
        if (section['instructors']) {
          var allProfs = section['instructors'];
          for (prof of allProfs) {
            var name = prof;
            if (name.match(expression)) {
              addIt = true;
              break;
            }
          }
        }
      }
      if (addIt) {
        possibleCourses.push(key);
      }
    }
  }
  return possibleCourses;
}



function getCoursesFilled(validCourses) {
  var possibleCourses = [];
  for (course of validCourses) {
    modifiedCourse = course; // TODO: do we need to clone or something?
    modifiedCourse.sections = {};
    hasValidSections = false;
    for (sectionId in course.sections) {
      if (course.sections[sectionId].status === "Open") {
        modifiedCourse.sections[sectionId] = course.sections[sectionId];
        hasValidSections = true;
      }
    }
    if (hasValidSections) {
      possibleCourses.push(modifiedCourse);
    }
  }
  return possibleCourses;
}

function getCoursesMatchingSchedule(validCourses) {
  var possibleCourses = [];
  for (course of validCourses) {
    modifiedCourse = course; // TODO: do we need to clone or something?
    modifiedCourse.sections = {};
    hasValidSections = false;
    for (sectionId in course.sections) {
      if (fitsInSchedule(course.sections[sectionId].schedule)) {
        modifiedCourse.sections[sectionId] = course.sections[sectionId];
        hasValidSections = true;
      }
    }
    if (hasValidSections) {
      possibleCourses.push(modifiedCourse);
    }
  }
  return possibleCourses;
}

function fitsInSchedule(schedule) {
  return true; // TODO: do better
}


function getCoursesFromDept(response, expression) {
  var possibleCourses = [];
  for (key of response) {
    if (key['departments']) {
      var allDepts = key['departments'];
      for (dept of allDepts) {
        if (dept['Name'] && dept['Name'] === expression) {
          possibleCourses.push(key);
          break;
        }
      }
    }
  }
  return possibleCourses;
}


function getCoursesFromArea(response, coursearea) {
  var areamap = globalCourseAreas[term][coursearea];
  var possibleCourses = [];
  for (key of response) {
    if(key['id'] in areamap) {
      //TODO: filter by sections
      possibleCourses.push(key);
    }
  }
  return possibleCourses;
}


function attributeFilter(response, attribute, expected, mustBe) {
  var filtered = [];
  for (key in response) {
    // Push the response object to the filtered array only if
    // if has the correct attribute when we want a specific attribute,
    // or if it does not have a specific attribute.
    if ((response[key][attribute] === expected && mustBe) ||
      (response[key][attribute] != expected && !mustBe)) {
      filtered.push(response[key]);
    }
  }
  return filtered;
}


////////////////////////// END PARSER ////////////////////////////////////




// (function getCourseTerms() {
//   //TODO: Call some function to have portal tell us which semesters are available
//   //PLACEHOLDER:
//   createDropdownBlock("Course Term:", "course-terms", "SP2018");
//   var terms = ["All", "SP2018", "FA2017", "SP2017", "FA2016", "SP2016"];
//   createDropdown("#course-terms", terms);
// }());


(function getCampuses() {
  createDropdownBlock("Campus:", "campus", "All");
  var terms = ["All", "Claremont McKenna", "Harvey Mudd", "Pitzer", "Pomona", "Scripps", "Keck Science", "Joint Music", "CMS PE", "Other"];
  createDropdown("#campus", terms);
}());


/*(function getDepartments() {
  createDropdownBlock("Department:", "department", "All");
  // Ideally, we could generate these terms by looping through each object 
  // and collecting every unique department name.
  // Unfortunately, for whatever reason, when I call this function later
  //  (i.e. call it from the getDepartments() function), everything appears
  //  correctly on the page, but when you click on an item in the dropdown,
  //  nothing happens.
  var terms = ['All',
               'American Studies',
               'Astronomy',
               'Biology',
               'Chemistry',
               'Computer Sci-Mathematics',
               'Computer Science',
               'Engineering',
               'First Year Seminar',
               'Government',
               'Humanit/Soc Science/Arts',
               'Integrative Experience',
               'Interdepartmental Course',
               'Mathematics',
               'Music',
               'Physical Education',
               'Physics'];
  createDropdown("#department", terms);
}());*/



// (function startTime() {
//   //TODO: Call some function to get this data from portal.
//   //PLACEHOLDER:
//   var terms = ["2:00", "3:00"];
//   createDropdownBlock("Time Start", "time-start", "All");
//   createDropdown("#time-start", terms);
// }());


// (function endTime() {
//   //TODO: Call some function to get this data from portal.
//   //PLACEHOLDER:
//   var terms = ["2:00", "3:00"];
//   createDropdownBlock("Time End", "time-end", "All");
//   createDropdown("#time-end", terms);
// }());

// (function building() {
//   //TODO: get actual building
//   var terms = ["Shan", "Parsons"];
//   createDropdownBlock("Building", "building", "All");
//   createDropdown("#building", terms);
// }());


/*(function availability() {
  //TODO: get actual building
  createDropdownBlock("Show Conflicts", "conflict", "Yes");
  var terms = ["Yes", "No"];
  createDropdown("#conflicts", terms);
}());*/




function createDropdownBlock(label, id, defaultText) {
  var div = $("<div>", {
    class: "dropdown my-dropdown col-sm-6",
    text: label
  });
  var button = $("<button>", {
    class: "btn btn-primary dropdown-toggle dropdown-button",
    id: id + "_btn",
    text: defaultText,
    "data-toggle": "dropdown",
    realVal: defaultText
  });
  var caret = getCaret();
  button.append(caret);
  div.append(button);
  var list = $("<ul>", {
    class: "dropdown-menu",
    id: id
  });
  div.append(list);
  $("#search-area").append(div);
}

function createDropdown(elementID, namesList) {
  var term;
  for (term of namesList) {
    var newListItem = $("<li>");
    var newLink = $("<a>", {
      text: term
    });
    newListItem.append(newLink);
    $(elementID).append(newListItem);
  }
}


$(".dropdown-menu li a").click(function() {
  $(this).parents(".dropdown").find(".btn").html($(this).text() + getCaret());
  $(this).parents(".dropdown").find(".btn").attr('realVal', $(this).text());
  updateSearch();
})



function getCaret() {
  return ' <span class="caret"></span>';
}




function showResult(courseIndex) {
  //Create a row to hold the results
  var courseObj = globalCourseSearch[courseIndex];

  var row = $("<tr>", {
    courseIndex: courseIndex
  });
  row.append($("<td>", {
    text: courseObj['id'] || 'NO SECTION'
  }));
  row.append($("<td>", {
    text: courseObj['name'] || 'No title'
  }));
  var instructors = '';
  for (var sectionId in courseObj['sections']) {
    section = courseObj['sections'][sectionId];
    for (var instructordata of section['instructors']) {
      if (instructors.length > 0) instructors += '; ';
      instructors += instructordata
    }
  }
  row.append($("<td>", {
    text: instructors
  }));
  
  row.append($("<td>", {
    text: formatCourseSchedule(courseObj)
  }));
  //row.append($("<td>", {text: ''}));
  
  row.append($("<td>", {
    text: formatCourseStatus(courseObj)
  }));

  /*var crCell = $("<td>")
  crCell.append($("<a>", {
    text: "Claremontreview",
    href: "http://claremontreview.com/courses/" + courseObj['id'].replace(/(\s)+/g, '_'),
    target: "blank",
    style: "text-decoration:underline; color:0x4444cc;"
  }));
  row.append(crCell);*/
  
  var buttonDiv = $("<td>");
  buttonDiv.append($("<button>", {
    text: "Schedule",
    class: "btn btn-sm btn-success schedule-button",
    courseIndex: courseIndex
  }));

  row.append(buttonDiv);
  $("#results-table").append(row);
}

function formatCourseStatus(courseObj) {
  var sectionStatuses = {}
  for (var sectionId in courseObj['sections']) {
    section = courseObj['sections'][sectionId];
    if(!(section.status in sectionStatuses)) {
      sectionStatuses[section.status] = 1;
    } else {
      sectionStatuses[section.status]++;
    }
  }
  if(Object.keys(sectionStatuses).length == 1) {
    return Object.keys(sectionStatuses)[0];
  }
  statusString = "";
  first = true;
  for(status in sectionStatuses) {
    if(!first) {
      statusString += ", ";
    }
    statusString += sectionStatuses[status] + " " + status;
    first = false;
  }
  return statusString;
}

function formatCourseSchedule(courseObj) {
  var timeslots = '';
  var isfirsttimeslot = true;
  var courseJson = courseObj;
  for (var sectionId in courseObj['sections']) {
    section = courseObj['sections'][sectionId];
    if (!isfirsttimeslot) {
      timeslots += '; ';
    }
    timeslots += formatSectionSchedule(section);
    isfirsttimeslot = false;
  }
  return timeslots
}

function formatSectionSchedule(section) {
  var timeslot = '';
  var isFirstTime = true;
  for (var schedule of section['schedule']) {
    if (!isFirstTime) {
      timeslot += ', ';
    }
    isFirstTime = false;
    timeslot += schedule['days']
    timeslot += ':\xa0'
    timeslot += schedule['start_time']
    timeslot += '\xa0-\xa0'
    timeslot += schedule['end_time']
  }
  return timeslot;
}

function repopulateChart() {
  $("#results-table").find("tbody").remove();
  $("#results-table").append($("<tbody>"));
  for (var i = 0; i < globalCourseSearch.length && i < 100; i++) {
    showResult(i);
  }
  if(i < globalCourseSearch.length) {
    globalShowMoreIndex = i
    addShowMore()
  }
  addButtonListeners();
}

function addShowMore() {
  var row = $('<tr>', {
    id: 'show-more-row'
  });
  var cell = $('<td>', {
    colspan: 42
  });
  var button = $('<button>', {
    class: 'btn btn-sm btn-primary show-more-button',
    id: 'show-more-btn',
    text: globalShowMoreIndex+' of '+globalCourseSearch.length+' results. Show All...'
  });
  cell.append(button);
  row.append(cell);
  $('#results-table').append(row);

  $('#show-more-btn').on('click.showmore', function() {
    showMore();
  });
}

function removeShowMore() {
  $('#show-more-row').remove()
}

function showMore() {
  removeButtonListeners();
  removeShowMore();
  for (var i = globalShowMoreIndex; i < globalCourseSearch.length; i++) {
    showResult(i);
  }
  if(i < globalCourseSearch.length) {
    globalShowMoreIndex = i
    addShowMore()
  }
  addButtonListeners();
}


function expandOrCollapse(row) {

  //Create expanded row
  var newRow = $("<tr>", {
    class: "open-course"
  });

  // Add a click listener to the new row
  $("#results-table").on('click', '.open-course', function(){
    expandOrCollapse(this);
  });

  // Put one element inside the new expanded row
  newRow.append($("<td>", {
    colspan: "100%",
    class: "expanded"
  }));

  // Close the current open row, if it exists
  var openRow = null;
  $("#results-table").children('tbody').each(function() {
    $(".open-course").remove();
    if ($(".open")[0]) {
      //If open, remove that class
      var openBox = $(".open")[0];
      openBox.className = "";
      openRow = openBox;
    }
  });

  // If we clicked the current open row or the expanded row, we're done.
  if (row.className.indexOf('open-course') > -1 || (openRow != null && row.getAttribute('courseindex') == openRow.getAttribute('courseindex'))) {
    return;
  }

  // Add the new row
  $(newRow).insertAfter(row);
  row.className += "open";
  //todo:take out
  //tempCourse = getCoursesFromAttributeRegex(filterCoursesByCalendar(globalCourseData, "designator", "SP2018"), 'courseNumber', /.*070.*/)[0];
  addExpandedData(row.getAttribute('courseindex'));
}

function removeButtonListeners() {
  $("#results-table tbody tr").off('click.addcollapse')
  $(".schedule-button").off('click.schedule')
  $(".favorite-button").off('click.favorite')
}

function addButtonListeners() {
  $("#results-table tbody tr").on('click.addcollapse', function() {
    expandOrCollapse(this);
  })

  $(".schedule-button").on('click.schedule', function(event) {
    event.stopPropagation();
    this.classList += " disabled";
    courseJson = globalCourseSearch[this.getAttribute('courseIndex')];
    var courseData = toCourseObject(courseJson);
    globalCourses.push(courseData);
    addCourse(courseData, globalCourses, globalFavCourses, false);
    document.getElementById('button-generate').disabled = false;
    save('courses', globalCourses);
  });


  $(".favorite-button").on('click.favorite', function(event) {
    event.stopPropagation();
    this.classList += " disabled";
    courseJson = globalCourseSearch[this.getAttribute('courseIndex')];
    var courseData = toCourseObject(courseJson);
    globalFavCourses.push(courseData);
    addCourse(courseData, globalCourses, globalFavCourses, true);
    save('favoriteCourses', globalFavCourses);
  });
}


var courses = [1, 2, 3];
var sections = [];




function addExpandedData(index) {
  var courseObj = globalCourseSearch[index];
  var title = "";
  if (courseObj['name']) {
    title = courseObj['name'];
  }

  var code = "";
  if (courseObj['id']) {
    code = courseObj['id']
  }

  var dept = "";
  if (courseObj['departments']) {
    jQuery.each(courseObj['departments'], function() {
      if (this['Name']) {
        dept += this['Name'] + ' ';
      }
    })
    courseTitle = courseObj['courseTitle']
  }

  var nameLine = "<h4>" + title + " (" + code + ")</h4>";
  var deptLine = "<h5>Dept: " + dept + "</h5>";
  var descLine = "<p style=\"text-align: left;\">" + courseObj['description'] + "</p>"
  var newRow = $(".expanded")[0];
  var subTable = $("<table>", {
    class: "table table-bordered"
  });
  var header = '<thead><th>Section</th><th>Professor</th><th>Credits</th><th>Times</th><th>Dates</th><th>Seats Filled</th></thead>'
  $(header).appendTo(subTable)
  $(nameLine).appendTo(newRow);
  $(deptLine).appendTo(newRow);
  $(descLine).appendTo(newRow);
  $(subTable).appendTo(newRow);



  //Loop through section-specific info
  var index = 1;
  jQuery.each(courseObj['sections'], function() {
    var prof = "";
    if (this['instructors']) {
      var instructordata = this['instructors'];
      jQuery.each(instructordata, function() {
        if (prof.length > 0) {
          prof += ', ';
        }
        prof += this.split(',')[0]
      });
    }

    var credits = "??"
    if (this['credits']) {
      credits = this['credits'];
    }

    var term = "";
    var start = "";
    var end = "";
    session = this
    if (session['externalId']) {
      term = session['externalId']
    }
    if (session['startDate']) {
      start = session['startDate']
    }
    if (session['endDate']) {
      end = session['endDate']
    }


    var times = formatSectionSchedule(this);

    var filled = "??"
    if (this['currentEnrollment'] != null) {
      filled = this['currentEnrollment'];
    }

    var capacity = "??"
    if (this['capacity']) {
      capacity = this['capacity'];
    }

    var status = "??"
    if (this['status']) {
      status = this['status'];
    }


    //Section string

    var sectionLine = "<td>" + index + "</td>";
    var profLine = "<td>" + prof + "</td>";
    var creditsLine = "<td>" + credits + "</td>";
    var scheduleLine = "<td>" + times + "</td>";
    var timeLine = "<td>" + start + " - " + end + "</td>";
    var availabilityLine = "<td>" + filled + "/" + capacity + " seats (" + status + ")</td>";

    var subRow = $("<tr>");
    subRow.append(sectionLine);
    subRow.append(profLine);
    subRow.append(creditsLine);
    subRow.append(scheduleLine);
    subRow.append(timeLine);
    subRow.append(availabilityLine);
    $(subRow).appendTo(subTable);

    index++;
  });
}
