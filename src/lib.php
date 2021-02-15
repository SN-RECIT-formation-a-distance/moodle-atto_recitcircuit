<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Atto text editor atto_circuit plugin lib.
 *
 * @package    atto_circuit
 * @copyright  2017 Matt Davidson <davidso1@rose-hulman.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Initialise the strings required for JS.
 *
 * @return void
 */
function atto_circuit_strings_for_js() {
    global $PAGE;

    // In order to prevent extra strings to be imported, comment/uncomment the characters
    // which are enabled in the JavaScript part of this plugin.
    $PAGE->requires->strings_for_js(array('circuittitle',
                                          'insert','mesure','error1', 'ampoule','Voltage_Alternatif','Voltage_Prise','sonore',
                                          'Ground_connection',
                                          'Node_label',
                                          'Voltage_source',
                                          'Current_source',
                                          'Voltage_pile',
                                          'volt',
                                          'Voltage_Batterie',
                                          'Resistor',
                                          'Resistorvariable',
                                          'Interrupteurbascule',
                                          'Capacitor',
                                          'Inductor',
                                          'Op_Amp',
                                          'Diode',
                                          'NFet',
                                          'PFet',
                                          'NPN',
                                          'PNP',
                                          'mesure',
                                          'moteur',
                                          'fusible',
                                          'voltmetre',
                                          'amperemetre',
                                          'ohmmetre',
                                          'Voltage_probe',
                                          'Current_probe',
                                          'drag_onto_diagram',
                                          'Help',
                                          'Grid',
                                          'Link_tip',
                                          'Cut',
                                          'Copy',
                                          'Paste',
                                          'Delete',
                                          'Rotate',
                                          'Save_netlist',
                                          'Exportasimage_netlist',
                                          'Open_netlist',
                                          'Select_netlist',
                                          'Perform_DC_Analysis',
                                          'DC_Analysis',
                                          'Perform_AC_Analysis',
                                          'Perform_Transient_Analysis',
                                          'Transient_Analysis',
                                          'Edit_Properties',
                                          'Link',
                                          'Sharable_Link',
                                          'points_per_decade',
                                          'Starting_frequency',
                                          'Ending_frequency',
                                          'source_for_ac',
                                          'AC_Analysis_add_a_voltage_probe',
                                          'AC_Analysis',
                                          'Zero_ac_response',
                                          'Near_zero_ac_response',
                                          'probe',
                                          'Alert',
                                          'ckt_alert1',
                                          'ckt_alert2',
                                          'ckt_warning1',
                                          'ckt_alert3',
                                          'ckt_alert4',
                                          'ckt_alert5',
                                          'ckt_alert6',
                                          'ckt_alert7',
                                          'ckt_alert8',
                                          'ckt_error1',
                                          'ckt_error2',
                                          'ckt_error3',
                                          'ckt_error4',
                                          'ckt_error5',
                                          'ckt_error6',
                                          'log_Frequency',
                                          'degrees',
                                          'AC_Phase',
                                          'AC_Magnitude',
                                          'Minimum_number_of_timepoints',
                                          'Stop_time_seconds',
                                          'tstop_lbl',
                                          'Transient_Analysis_add_a_probe',
                                          'probe_is_connected_to_node',
                                          'which_is_not_an_actual_circuit_node',
                                          'Voltage',
                                          'Current',
                                          'Time',
                                          'Node_has_two_conflicting_labels',
                                          'DC_value',
                                          'impulse',
                                          'Height',
                                          'Width',
                                          'step',
                                          'Initial_value',
                                          'Plateau_value',
                                          'Delay_until_step',
                                          'Rise_time',
                                          'square',
                                          'Frequency',
                                          'Duty_cycle',
                                          'triangle',
                                          'pwl',
                                          'pwl_repeating',
                                          'Comma_separated_list',
                                          'pulse',
                                          'Delay_until_pulse',
                                          'Time_for_first_transition',
                                          'Time_for_second_transition',
                                          'Pulse_width',
                                          'Period',
                                          'sin',
                                          'Offset_value',
                                          'Amplitude',
                                          'Delay_until_sin_starts',
                                          'Phase_offset_degrees',
                                          'Circuit_Sandbox_Help',
                                          'name',
                                          'value',
                                          'label',
                                          'r',
                                          'c',
                                          'l',
                                          'color',
                                          'offset',
                                          'area',
                                          'type',
                                          'normal',
                                          'DEL',
                                          'bferme',
                                          'bouvert','poussoir', 'magnetique', 'bidir',
                                          'WL',
                                          'A',
                                          'Plot_color',
                                          'Plot_offset',
                                          'dc',
                                          'red',
                                          'green',
                                          'blue',
                                          'cyan',
                                          'magenta',
                                          'yellow',
                                          'orange',
                                          'black',
                                          'xaxis',
                                          'Ics',
                                          'Ies',
                                          'alphaF',
                                          'alphaR',
                                          'last_line',
                                          'strSHelp',
                                          'strAddC', 
'strAddW', 
'strSel',  
'strMove', 
'strDel',  
'strRot',
'strProp', 
'strNum' 
                                          ),
                                    'atto_circuit');
}

/**
 * Set params for this plugin
 * @param string $elementid
 */
function atto_circuit_params_for_js($elementid, $options, $fpoptions) {
   /* global $CFG, $SESSION, $USER, $COURSE, $SITE, $PAGE, $DB, $THEME ;
    $context = $options['context'];
    if (!$context) {
        $context = context_system::instance();
    }
    
    //$context = context_course::instance($COURSE->id);
    $context = get_context_instance(CONTEXT_COURSE,$COURSE->id);
    $roles = array();
$roles = get_user_roles($context, $USER->id, false);
$role = key($roles);
$rolename = $roles[$role]->shortname;


    
    $sesskey = sesskey();
    $allowedusers = get_config('atto_circuit', 'allowedusers');*/
    

    // Update $allowedtypes to account for capabilities.
  /*  if ($allowedusers === 'teachersonly' && ((has_capability('moodle/legacy:editingteacher', $context, $USER->id, false) || (has_capability('moodle/legacy:teacher', $context, $USER->id, false)))))*/ 
    /*if (($allowedusers === 'teachersonly') && ($rolename ==='coursecreator')){*/
        $allowed = 1;
    /*} 
    else if ($allowedusers === 'allusers' ) {
    $allowed = 1;
    }
    else {
        $allowed = 0;
    }*/

   
             
    // Pass the number of visible groups as a param.
    $params = array('storeinrepo' => get_config('atto_circuit', 'storeinrepo'),
                    'allowed' => $allowed);

    return $params;
}