/*
 *
 *
 */

//File

//JSON.p


/**
 * Returns a string version
 *
 */

var COURSE_JSON_URL = "//boxen.yancey.io/courses.json?callback=lingk";
var response;

function lingkCallback(json) {
    response = json["data"];
    router(response);
}

function router(response) {
    console.log(response);
}

//var response = jQuery.getScript(COURSE_JSON_URL);

/*
function getJSONFromSource(url) {
    var httpRequest = new XMLHttpRequest();
    httpRequest.responseType = "json";
    httpRequest.open("GET", COURSE_JSON_URL, true);
    httpRequest.send();
    
    httpRequest.addEventListener("readystatechange", processRequest, false)
    var reponse = processRequest(httpRequest)
    return JSON.parse(
}

function processRequest(request) {
    if(request.readyState == 4 && request.status == 200) {
        
    }
}
*/
