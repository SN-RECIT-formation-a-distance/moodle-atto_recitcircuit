echo off

rem remove the current link
junction -d recitfad-moodle-plugin-cahiertraces\src
junction -d recitfad-moodle-plugin-treetopics\src

rem set the link
junction recitfad-moodle-plugin-cahiertraces\src moodle\mod\recitcahiercanada
junction recitfad-moodle-plugin-treetopics\src moodle\course\format\treetopics

pause