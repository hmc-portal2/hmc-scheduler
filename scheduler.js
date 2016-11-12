var globalCourseData = [];
var globalCourseSearch = [];
var globalCourses;
var globalFavCourses;

function lingkCallback(json) {
  globalCourseData = json['data'];
  updateSearch();
}

function updateSearch() {
  globalCourseSearch = globalCourseData;
  globalCourseSearch = filterCoursesByCalendar(globalCourseSearch, "designator", "SP2017");
  globalCourseSearch = getCourseFromAttributeRegex(globalCourseSearch, "courseNumber", /.*070.*/);
  for(var data of globalCourseSearch) addCourse(toCourseObject(data), globalCourses, globalFavCourses);
}

function toAmPmTime(timestring) {
  if(timestring.length === 3) {
    timestring = '0' + timestring;
  }
  hours = timestring.substring(0,2);
  ispm = hours > 12;
  if(ispm) hours = '' + (hours - 12);
  if(hours.length === 1) {
    hours = '0' + hours;
  }
  minutes = timestring.substring(2,4);
  return hours + ':' + minutes + (ispm? 'PM': 'AM');
}

function toCourseObject(courseJson) {
  var courseName = courseJson['courseTitle'];
  var timeslots = '';
  var isfirsttimeslot = true;
  for(var section of courseJson['courseSections']) {
    if(!isfirsttimeslot) {
      timeslots += '\n';
    }
    var instructorName = '';
    if(section['sectionInstructor'] && section['sectionInstructor'].length > 0) {
      var instructor = section['sectionInstructor'][0];
      if(instructor['lastName']) {
        instructorName = instructor['lastName'];
      } else if(instructor['firstName']) {
        instructorName = instructor['firstName'];
      } else {
        instructorName = 'Unknown';
      }
    } else {
      instructorName = 'Unknown';
    }
    var timeslot = '';
    timeslot += section['externalId'];
    timeslot += ' (';
    timeslot += instructorName;
    timeslot += '): ';
    var isFirstTime = true;
    for(var schedule of section['courseSectionSchedule']) {
      if(!isFirstTime) {
        timeslot += ', ';
        isFirstTime = true;
      }
      timeslot += schedule['classMeetingDays'].replace(/-/g, '');
      timeslot += ' ';
      timeslot += toAmPmTime(schedule['classBeginningTime']);
      timeslot += '-';
      timeslot += toAmPmTime(schedule['classEndingTime']);
      timeslot += '; ';
      timeslot += schedule['instructionSiteName'];
    }
    timeslots += timeslot;
    isfirsttimeslot = false;
  }
  return {
    name: courseName,
    times: timeslots,
    selected: false,
    data: courseJson,
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
  course._node.toJSON = function () { return undefined; };

  // Fill in the values
  if (course.name) courseNode.querySelector('input[type="text"]').value = course.name;
  courseNode.querySelector('input[type="checkbox"]').checked = course.selected;
  if (course.times) courseNode.querySelector('textarea').value = course.times;
  courseNode.querySelector('input[type="text"]').style.backgroundColor = course.color || randomColor(course.name);

  // Collapsing and expanding
  courseNode.querySelector('input[type="text"]').onfocus = function () {
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
  courseNode.querySelector('input[type="text"]').onchange = function () {
    course.name = this.value;

    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
  };
  courseNode.querySelector('textarea').onchange = function () {
    course.times = this.value.trim();

    // Add a trailing line break to facilitate copy/paste
    if (this.value[this.value.length - 1] != '\n')
      this.value += '\n';

    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
  };
  courseNode.querySelector('input[type="checkbox"]').onchange = function () {
    course.selected = !!this.checked;
    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
  };

  // Tabbing
  courseNode.querySelector('input[type="text"]').setAttribute('tabindex', ++tabIndex);
  courseNode.querySelector('textarea').setAttribute('tabindex', ++tabIndex);

  // Deleting
  courseNode.querySelector('.x').onclick = function () {
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
  courseNode.querySelector('.c').onclick = function () {
    var color = course.color || randomColor(course.name);
    courseNode.querySelector('input[type="text"]').style.backgroundColor = course.color = color.replace(/\d+/, function (hue) { return (+hue + 24) % 360; });
    save('courses', courses);
    document.getElementById('button-generate').disabled = false;
    return false;
  };

  // Active to favorites
  courseNode.querySelector('.atf').onclick = function () {
    document.getElementById('favorite-courses').appendChild(courseNode);
    favoriteCourses.push(courses.splice(courses.indexOf(course), 1)[0]);
    save('courses', courses);
    save('favoriteCourses', favoriteCourses);

    courseNode.getElementsByClassName('atf')[0].style='display: none;';
    courseNode.getElementsByClassName('fta')[0].style='';

    if (courses.length == 0) {
      document.getElementById('courses-container').classList.add('empty');
      document.getElementById('courses-container').classList.remove('not-empty');
    }
    document.getElementById('favorite-courses-container').classList.add('not-empty');
    document.getElementById('favorite-courses-container').classList.remove('empty');
    return false;
  };

  // Favorite to active
  courseNode.querySelector('.fta').onclick = function () {
    document.getElementById('courses').appendChild(courseNode);
    courses.push(favoriteCourses.splice(favoriteCourses.indexOf(course), 1)[0]);
    save('courses', courses);
    save('favoriteCourses', favoriteCourses);

    courseNode.getElementsByClassName('atf')[0].style='';
    courseNode.getElementsByClassName('fta')[0].style='display: none;';

    if (favoriteCourses.length == 0) {
      document.getElementById('favorite-courses-container').classList.add('empty');
      document.getElementById('favorite-courses-container').classList.remove('not-empty');
    }
    document.getElementById('courses-container').classList.add('not-empty');
    document.getElementById('courses-container').classList.remove('empty');
    return false;
  };

  if(fc) {
    courseNode.getElementsByClassName('atf')[0].style='display: none;';
    courseNode.getElementsByClassName('fta')[0].style='';
    
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

  drawSchedule(schedules[i] || []);
  return i;
}

function drawSchedule(schedule) {
  var days = Array.prototype.slice.call(document.querySelectorAll('.day'));
  var beginHour = 8 - 0.5; // Starts at 8am
  var hourHeight = document.querySelector('#schedule li').offsetHeight;

  // Clear the schedule
  days.forEach(function (day) {
    while (day.firstChild)
      day.removeChild(day.firstChild);
  });

  // Add each time slot
  schedule.forEach(function (timeSlot) {
    var div = document.createElement('div');
    div.style.top = hourHeight * (timeSlot.from - beginHour) + 'px';
    div.style.backgroundColor = timeSlot.course.color || randomColor(timeSlot.course.name);
    div.innerHTML = (options.showSections && timeSlot.section ?
        timeSlot.section.replace(/^([^(]+)\((.*)\)/, function (_, code, profs) {
          return '<b>' + code + '</b><br />' + profs;
        })
        : '<b>' + timeSlot.course.name + '</b>') +
      '<br />' + formatHours(timeSlot.from) + ' - ' + formatHours(timeSlot.to);

    days[timeSlot.weekday].appendChild(div);

    // Vertically center
    var supposedHeight = (timeSlot.to - timeSlot.from) * hourHeight;
    var paddingHeight = (supposedHeight - div.offsetHeight) / 2;
    div.style.padding = paddingHeight + 'px 0';
    div.style.height = (supposedHeight - paddingHeight * 2) + 'px';
  });
}

function addSavedSchedule(name, schedule, savedSchedules) {
  var div = document.createElement('div');

  var scheduleLink = document.createElement('a');
  scheduleLink.href = '#';
  scheduleLink.onclick = function () {
    drawSchedule(schedule);
    document.getElementById('button-generate').disabled = false;
    return false;
  };
  scheduleLink.appendChild(document.createTextNode(name));

  var removeLink = document.createElement('a');
  removeLink.href = '#';
  removeLink.className = 'x';
  removeLink.onclick = function () {
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
  for (i in mapOfCourses)  {
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
  for (i in timeBlocks)
    this.weekdays.push(timeBlocks[i].weekday);
  this.startTime = timeBlocks[0].from;
  this.endTime = timeBlocks[0].to;
  this.startDate = new Date(Date.parse(timeBlocks[0].course.data.startDate));

  // Update the start date of the class to the first day where there is
  // actually a class (according to the MTWRF flags)
  var startDay = this.startDate.getDay();
  var daysTillClasses = this.weekdays.map(function (weekday) {
    var day = weekday + 1;
    return (7 + day - startDay) % 7;
  });
  var daysTillFirstClass = Math.min.apply(null, daysTillClasses);
  this.startDate.setDate(this.startDate.getDate() + daysTillFirstClass);

  this.endDate = new Date(Date.parse(timeBlocks[0].course.data.endDate));
  this.name = timeBlocks[0].course.name;
  this.loc = timeBlocks[0].loc;
  this.toString = function () {
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
    var rrule = 'RRULE:FREQ=WEEKLY;BYDAY=' + this.weekdays.map(function(day) { return days[day]; }).join(',') + ';UNTIL=' + formatDate(this.endDate) + '\n';
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
  var classes = courses.filter(function (course) { return course.selected && course.times; }).map(function (course) {
    // Parse every line separately
    return course.times.split('\n').map(function (timeSlot) {

      // Extract the section info from the string, if it's there.
      var section = timeSlot.indexOf(': ') > -1 ? timeSlot.split(': ')[0] : '';

      // Split it into a list of each day's time slot
      var args = [];
      // The lookahead at the end is because meeting times are delimited by commas (oops), but the location may contain commas.
      timeSlot.replace(/([MTWRF]+) (\d?\d):(\d\d)\s*(AM|PM)?\s*\-\s?(\d?\d):(\d\d)\s*(AM|PM)?;([^;]*?)(?=$|, \w+ \d?\d:\d{2})/gi, function (_, daylist, h1, m1, pm1, h2, m2, pm2, loc) {
        daylist.split('').forEach(function (day) {
          args.push({
            'course': course,
            'section': section,
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
  var state = classes.map(function () { return 0; }); // Array of the same length
  while (true) {

    // Add this possibility
    combos.push(classes.map(function (course, i) {
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
  var concatted = combos.map(function (combo) {
    return Array.prototype.concat.apply([], combo);
  });


  // And remove conflicting schedules
  return options.allowConflicts ? concatted : concatted.filter(function (timeSlots) {
    // Loop over every six minute interval and make sure no two classes occupy it
    for (var day = 0; day < 5; day++) {

      var todaySlots = timeSlots.filter(function (timeSlot) { return timeSlot.weekday == day; });
      for (var t = 0; t < 24; t += 0.1) {
        var classesThen = todaySlots.filter(function (timeSlot) {
          return timeSlot.from < t && t < timeSlot.to;
        });
        var uniqueClassesThen = unique_classes(classesThen);
        if (uniqueClassesThen.length > 1) {
          return false;
        }
      }
    }

    return true;
  });
}

// This function takes a list of courses and reduces it - removing any
// two timeSlots that have the same course name
function unique_classes (timeSlots) {
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

(function () {
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

  document.getElementById('button-save').onclick = function () {
    var name = prompt('What would you like to call this schedule?', '');
    if (name) {
      savedSchedules[name] = JSON.parse(JSON.stringify(schedules[schedulePosition]));
      addSavedSchedule(name, savedSchedules[name], savedSchedules);
      save('savedSchedules', savedSchedules);
    }
  };

  document.getElementById('button-generate').onclick = function () {
    schedules = generateSchedules(courses);

    // Display them all
    schedulePosition = loadSchedule(schedules, 0);

    // The credit count
    var count = courses.filter(function (course) {
      return course.selected;
    }).map(function (course) {
      if (!course.data || !course.data['creditValue'])
        return NaN;

      // Mudd courses are worth their full value.
      if ((course.data['courseNumber'].indexOf('HM') == -1))
        return course.data['creditValue'];

      // Other colleges' courses need to be multiplied by three.
      return course.data['creditValue'] * 3;
    }).reduce(function (a, b) {
      return a + b;
    }, 0);
    document.getElementById('credit-counter').innerHTML = isNaN(count) ? '' : '(' + count.toFixed(1) + ' credits)';

    this.disabled = true;
  };

  document.getElementById('button-sections').checked = options.showSections = localStorage.showSections;
  document.getElementById('button-sections').onclick = function () {
    localStorage.showSections = options.showSections = this.checked;
    document.getElementById('button-generate').onclick();
  };

  document.getElementById('button-conflicts').checked = options.allowConflicts = localStorage.allowConflicts;
  document.getElementById('button-conflicts').onclick = function () {
    localStorage.allowConflicts = options.allowConflicts = this.checked;
    document.getElementById('button-generate').onclick();
  };

  // Navigating schedules
  document.getElementById('button-left').onclick = function () { schedulePosition = loadSchedule(schedules, schedulePosition - 1); };
  document.getElementById('button-right').onclick = function () {
    schedulePosition = loadSchedule(schedules, schedulePosition + 1);
    this.classList.add('clicked');
  };
  document.onkeydown = function (e) {
    if (e.keyCode == 39)
      document.getElementById('button-right').onclick();
    else if (e.keyCode == 37)
      document.getElementById('button-left').onclick();
  };

  // Messages from the bookmarklet
  /*window.onmessage = function (e) {
    // Extract information from the message
    try {
      var data = JSON.parse(e.data);
    } catch (e) {
      return;
    }

    var name = data['courseName'];

    // Build the timeSlot string.
    var timeSlot =
      data['courseCode'].replace(/\s+/g, ' ') + ' (' +

      data['professors'].map(function (prof) {
          // Only last names to save space.
          return prof.split(',')[0];
        }).join(', ') + '): ' +

      data['timeSlots'].filter(function (timeSlot) {
          // Make sure they're actually of the correct format
          return /([MTWRF]+) (\d?\d):(\d\d)\s*(AM|PM)?\s*\-\s?(\d?\d):(\d\d)\s*(AM|PM)?/gi.test(timeSlot);
        }).filter(function (timeSlot, i, arr) {
          // Remove duplicates
          return arr.lastIndexOf(timeSlot) == i;
        }).join(', ');

    // See if the course being passed in is already in the course list
    var course = false;
    for (var i = 0; i < courses.length; i++)
      if (courses[i].name == name) {
        course = courses[i];
        break;
      }

    // Not there yet? Make it.
    if (!course) {
      course = {
        'name': name,
        'selected': true,
        'times': timeSlot,
        'data': data
      };
      courses.push(course);
      addCourse(course, courses, favoriteCourses, false);
    }

    // Add this time to the list if it's not already there
    else {
      course.data = data;
      var existingTimes = course.times.split('\n');
      if (existingTimes.indexOf(timeSlot) == -1) {
        existingTimes.push(timeSlot);
        course._node.querySelector('textarea').value = course.times = existingTimes.join('\n');
      }
      course._node.querySelector('input[type="text"]').onfocus();
    }

    save('courses', courses);
    document.getElementById('button-generate').onclick();
  };*/

  // Display all the courses
  if (courses.length) {
    for(var i = 0; i < courses.length; i++) {
      addCourse(courses[i], courses, favoriteCourses, false);
    }
    document.getElementById('button-generate').onclick();
  }

  // Display all the favorite courses
  if (favoriteCourses.length) {
    for(var i = 0; i < favoriteCourses.length; i++) {
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

  document.getElementById('button-print').onclick = function () {
    if (detection['chrome'] && messageOnce('print-tip'))
      alert('Pro-tip: Chrome has an option on the Print dialog to disable Headers and Footers, which makes for a prettier schedule!');
    window.print();
  };
  
  document.getElementById('button-clear').onclick = function () {
    if (confirm('Are you sure you want to delete all the courses you\'ve added?')) {
      save('courses', courses = []);
      save('favoriteCourses', favoriteCourses = []);
      window.location.reload();
    }

    return false;
  };

  document.getElementById('button-export').onclick = function () {
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
            //console.log(key[attribute]);
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


////////////////////////// END PARSER ////////////////////////////////////





(function getCourseTerms() {
  //TODO: Call some function to get this data from portal.
  //PLACEHOLDER:
  createDropdownBlock("Course Term", "course-terms", "Spring!");
  var terms = ["spring17", "fall17", "never"];
  createDropdown("#course-terms", terms);
}());



// (function courseNumberStart() {
//   //TODO: Call some function to get this data from portal.
//   //PLACEHOLDER:
//   var terms = ["2:00", "3:00"];
//   createDropdownBlock("Course Number Start", "num-start", "All");
//   createDropdown("#num-start", terms);
// }());


// (function courseNumberEnd() {
//   //TODO: Call some function to get this data from portal.
//   //PLACEHOLDER:
//   var terms = ["2:00", "3:00"];
//   createDropdownBlock("Course Number End", "num-end", "All");
//   createDropdown("#num-end", terms);
// }());


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


// (function campus() {
//   var terms = ["Mudd", "Pomona"];
//   createDropdownBlock("Campus", "campus", "All");
//   createDropdown("#campus", terms);
// }());


// (function building() {
//   //TODO: get actual building
//   var terms = ["Shan", "Parsons"];
//   createDropdownBlock("Building", "building", "All");
//   createDropdown("#building", terms);
// }());


(function availability() {
  //TODO: get actual building
  var terms = ["All", "Open", "Full"];
  createDropdownBlock("Availability", "availability", "All");
  createDropdown("#availability", terms);
}());










function createDropdownBlock(label, id, defaultText) {
  var div = $("<div>", {class: "dropdown my-dropdown col-sm-6", text: label});
  var button = $("<button>", {class: "btn btn-primary dropdown-toggle dropdown-button", text: defaultText + "  ", "data-toggle": "dropdown"}); 
  var caret = getCaret();
  button.append(caret);
  div.append(button);
  var list = $("<ul>", {class: "dropdown-menu", id: id});
  div.append(list);
  $("#search-area").append(div);
}


function print(str) {
  console.log(str);
}


function createDropdown(elementID, namesList) {
  var term;
    for (term of namesList) {
    var newListItem = $("<li>");
    var newLink = $("<a>", {text: term});
    newListItem.append(newLink);
    $(elementID).append(newListItem);
  }
}


$(".dropdown-menu li a").click(function() {
  $(this).parents(".dropdown").find(".btn").html($(this).text() + getCaret());
})



function getCaret() {
  return ' <span class="caret"></span>';
}




function showResult(courseObj) {
  //Create a row to hold the results
  var row = $("<tr>", {courseIndex: 3}); //TODO: Instaed of three, make this an index of the courseObj
  row.append($("<td>", {text: "ECON104"}));
  row.append($("<td>", {text: "Financial Economics"}));
  row.append($("<td>", {text: "Gary Evans"}));
  row.append($("<td>", {text: "50/500"}));
  row.append($("<td>", {text: "Open"}));
  row.append($("<td>", {text: "Never (unless you really want to go to class)"}));
  row.append($("<td>", {text: "3.0"}));
  row.append($("<td>", {text: "9/9/9"}));
  row.append($("<td>", {text: "12/12/12"}));
  var buttonDiv = $("<td>");
  buttonDiv.append($("<button>", {text: "Add to Favorites", class:"btn btn-primary favorite-button"}));
  buttonDiv.append($("<button>", {text: "Add to Schedule", class:"btn btn-success schedule-button"}));
  row.append(buttonDiv);
  $("#results-table").append(row);
}



(function tempPopulateChart() {
  for(var i = 0; i < 10; i++) {
    showResult(3);
  }
}());

$("#results-table tbody tr").click(function() {
  //Expand row
  var newRow = $("<tr>", {class:"open-course"});
  newRow.append($("<td>", {colspan:"100%", class:"expanded"}));
  var openRow = null;
  $("#results-table").children('tbody').each(function() {
    $(".expanded").remove();
    if ($(".open")[0]) {
      //If open, remove it
      var openBox = $(".open")[0];
      openBox.className = "";
      openRow = openBox;
    }
  });
  if (openRow == this) {
    return;
  }
  $(newRow).insertAfter(this);
  this.className += "open";
  addExpandedData(this.courseIndex); //TODO: Make sure this exists
})



var courses = [1,2,3]; //TODO: Fix this!


function addExpandedData(index) {
  var courseObj = courses[index]; //TODO: Make sure this gets an actual course object
  var nameLine = "<p>Financial Econ" + "(" + "ECON104" + ")</p>";
  var profLine = $("<p>", {text:"Prof: " + "Gary Evans"});
  var deptLine = "<p>Dept:" + "Economics</p>";
  var timeLine = "<p>Offered:" + "Spring 2017" + ": " + "1/1/1" + " through " + "2/2/2</p>";
  var scheduleLine = "<p>Times:" + "T/R 2:45-5:30PM</p>";
  var availabilityLine = "<p>Open: " + "3" + " out of " + "15" + " seats " + " available</p>";
  var newRow = $(".expanded")[0]
  print($(".expanded"));
  $(nameLine).appendTo(newRow);
  $(profLine).appendTo(newRow);
  $(deptLine).appendTo(newRow);
  $(timeLine).appendTo(newRow);
  $(scheduleLine).appendTo(newRow);
  $(availabilityLine).appendTo(newRow);
  print("func got called");
}


$("#results-table tbody tr td .schedule-button").click(function() {
  print("selection pushed")
  //TODO: Add to selected courses
  //this.disabled = true;
  this.classList += " disabled";
});


$("#results-table tbody tr td .favorite-button").click(function() {
  print("selection pushed")
  //TODO: Add to favorite courses
  this.classList += " disabled";
});