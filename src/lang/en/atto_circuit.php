<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 3 of the License; or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful;
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not; see <http://www.gnu.org/licenses/>.

/**
 * Strings for component 'atto_circuit'; language 'en'.
 *
 * @package    atto_circuit
 * @copyright (C) 2011 Massachusetts Institute of Technology
 * @copyright (C) 2015-2019 Modifications by Khan Academy and Willy McAllister, Spinning Numbers.
 * @copyright (C) 2021 Adapations for Moodle, RECITFAD https://recitfad.ca .
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

$string['pluginname'] = 'Circuit';
$string['privacy:metadata'] = 'The Circuit plugin does not save or export user data.';
$string['circuittitle'] = 'Circuit and Save';
$string['insert'] = 'Insert Circuit';
$string['settings'] = 'Circuit settings';
$string['storeinrepo'] = 'Store as image file';
$string['storeinrepo_desc'] = 'If checked the circuit will be saved as a standard image upload instead of a base64 inline image.';
$string['allusers'] = 'All users';
$string['teachersonly'] = 'Teachers only';
$string['allowedusers'] = 'Allowed users';
$string['allowedusers_desc'] = 'Allowed users to use circuit';

$string['error_start'] =  'Sorry; there was a browser error in starting the schematic tool. We recommend using the latest versions of Firefox and Chrome.';
$string['ground_connection'] =  'Ground connection';
$string['node_label'] =  'Node label';
$string['voltage_source'] =  'Voltage source';
$string['current_source'] =  'Current source';
$string['voltage_pile'] =  'Pile';
$string['voltage_battery'] =  'Battery';
$string['alternative_voltage'] =  'Alternative votage';
$string['socket_voltage'] =  'Socket';
$string['speaker'] =  'Speaker';
$string['heatingelement'] =  'Heating element';
$string['relay'] =  'Relay';
$string['cellpic'] =  'Photoelectric cell';
$string['buttonswitch'] =  'Button switch';
$string['magneticswitch'] =  'Magnetic switch';
$string['light'] =  'Light';
$string['sound'] =  'Buzzer';
$string['resistor_variable'] =  'Resistor variable';
$string['toggle_switch'] =  'Toggle switch';
$string['capacitor'] =  'capacitor';
$string['inductor'] =  'inductor';
$string['Op_Amp'] =  'Op Amp';
$string['Diode'] =  'Diode';
$string['NFet'] =  'NFet';
$string['PFet'] =  'PFet';
$string['NPN'] =  'NPN';
$string['PNP'] =  'PNP';
$string['measurement'] = 'Mesurement device';
$string['motor'] = 'Motor';
$string['fuse'] = 'Fuse';
$string['voltmeter'] = 'Voltmeter';
$string['amperemeter'] = 'Amperemeter';
$string['ohmmetre'] = 'Ohmmeter';
$string['voltage_probe'] =  'Voltage probe';
$string['current_probe'] =  'Current probe';
$string['drag_onto_diagram'] =  'drag or tap to insert';
$string['help'] =  'display the help page';
$string['grid']  = 'toggle grid display';
$string['link_tip'] = 'share a link to the circuit';
$string['cut'] =  'Cut selected components to the clipboard';
$string['copy'] = 'Copy selected components to the clipboard';
$string['paste'] = 'Paste clipboard to the schematic';
$string['delete'] = 'Delete selected components';
$string['rotate'] = 'Rotate selected component';
$string['save_netlist'] =  'Save netlist';
$string['exportasimage_netlist'] =  'Save as image';
$string['open_netlist'] =  'Open netlist';
$string['select_netlist'] =  'Select netlist';
$string['perform_DC_analysis'] =  'Perform a DC Analysis';
$string['DC_analysis'] =  'DC Analysis';
$string['perform_AC_analysis'] =  'Perform an AC Small-Signal Analysis';
$string['perform_Transient_analysis'] =  'Perform a Transient Analysis';
$string['transient_analysis'] =  'Transient Analysis';
$string['edit_properties'] =  'Edit Properties';
$string['link'] =  'link';
$string['sharable_link'] =  'Sharable link';

$string['points_per_decade'] =  'Number of points/decade';
$string['starting_frequency'] =  'Starting frequency (Hz)';
$string['ending_frequency'] =  'Ending frequency (Hz)';	
$string['source_for_ac'] =  'Name of V or I source for ac';
$string['AC_analysis_add_a_voltage_probe'] =  ' add a voltage probe to the diagram!';
$string['AC_analysis'] =  'AC Analysis';
$string['zero_ac_response'] =  'Zero ac response; -infinity on dB scale.';
$string['near_zero_ac_response'] =  'Near zero ac response; remove ';
$string['probe'] =  ' probe';

// Alerts and warnings from the circuit simulator
$string['alert'] =  'alert';
$string['ckt_alert_shortcircuit'] =  'Warning! Circuit has a voltage source loop or a source or current probe shorted by a wire; please remove the source or the wire causing the short.';
$string['ckt_alert_meaningless'] =  'Warning! Simulator might produce meaningless results or no result with illegal circuits.';
$string['ckt_warning_samename'] =  'Warning! Two circuit elements share the same name ';
$string['ckt_alert_noground'] =  'Please make at least one connection to ground (triangle symbol)';
$string['ckt_alert_newtonfailed1'] =  'Newton Method failed; do your current sources have a conductive path to ground?';
$string['ckt_alert_newtonfailed2'] =  'Newton Method failed; it may be your circuit or it may be our simulator.';
$string['ckt_alert_dcfailed'] =  'DC failed; trying transient analysis from zero.';
$string['ckt_alert_acunknownsource'] =  'AC analysis refers to an unknown source; ';
$string['ckt_alert_acanalysisfailed'] =  'AC analysis failed; unknown source.';	

$string['ckt_error_rowsmismatch'] =  'Rows of M mismatched to b or cols mismatch to x.';
$string['ckt_error_rowatoolargeforb'] =  'Row or columns of A too large for B';
$string['ckt_error_rowatoolargeforc'] =  'Row or columns of A too large for C';
$string['ckt_error_noscalar'] =  'scalea and scaleb must be scalars or Arrays';
$string['ckt_error_rowexceedcol'] =  'Rows or cols > rows or cols of dest';
$string['ckt_error_colexceedrow'] =  'Rows or cols > cols or rows of dest';	    	    

$string['log_frequency'] =  'log(Frequency in Hz)';
$string['degrees'] =  'degrees';
$string['AC_phase'] =  'AC Phase';
$string['AC_magnitude'] =  'AC Magnitude';

$string['minimum_number_of_timepoints'] =  'Minimum number of time points';
$string['stop_time_seconds'] =  'Stop time (seconds)';
$string['stop_time'] =  'stop time';
$string['transient_analysis_add_a_probe'] = '  add a probe to the diagram!';

//Use creative phrasing to get this sentence to come out right'] =  
// alert('The ' + color + ' probe is connected to node ' + '"' + label + '"' + '; which is not an actual circuit node');
$string['probe_is_connected_to_node'] =  ' probe is connected to node ';
$string['which_is_not_an_actual_circuit_node'] =  '; which is not an actual circuit node.';

$string['voltage'] =  'voltage';
$string['current'] =  'current';
$string['time'] =  'time';
$string['node_has_two_conflicting_labels'] =  'Node has two conflicting labels:';

$string['DC_value'] =  'DC value';

$string['impulse'] =  'impulse';
$string['height'] =  'height';
$string['width'] =  'Width (secs)';

$string['step'] =  'step';
$string['initial_value'] =  'Initial value';
$string['plateau_value'] =  'Plateau value';
$string['delay_until_step'] =  'Delay until step (secs)';
$string['rise_time'] =  'Rise time (secs)';

$string['square'] =  'square';
$string['Frequency'] =  'Frequency (Hz)';
$string['duty_cycle'] =  'Duty cycle (%)';

$string['triangle'] =  'triangle';

$string['pwl'] =  'pwl';
$string['pwl_repeating'] =  'pwl (repeating)';
$string['comma_separated_list'] =  'Comma-separated list of alternating times and values';

$string['pulse'] =  'pulse';
$string['delay_until_pulse'] =  'Delay until pulse (secs)';
$string['time_for_first_transition'] =  'Time for first transition (secs)';
$string['time_for_second_transition'] =  'Time for second transition (secs)';
$string['pulse_width'] =  'Pulse width (secs)';
$string['period'] =  'Period (secs)';

$string['sin'] =  'sin';
$string['offset_value'] =  'Offset value';
$string['amplitude'] =  'amplitude';
$string['delay_until_sin_starts'] =  'Delay until sin starts (secs)';
$string['phase_offset_degrees'] =  'Phase offset (degrees)';

$string['circuit_sandbox_help'] =  'CIRCUIT SANDBOX HELP';
$string['name'] =  'Name';
$string['value'] =  'Value';
$string['label'] =  'Label';
$string['r'] =  'R';
$string['c'] =  'C';
$string['l'] =  'L';
$string['color'] =  'Color';
$string['offset'] =  'Offset';
$string['volt'] =  'voltage';
$string['area'] =  'Area';
$string['type'] =  'Type';
$string['normal'] =  'normal';
$string['led'] =  'led';
$string['closed'] =   "Closed switch";
$string['open'] =  "Opened switch";
$string['magnetic'] =   "Magnetic";
$string['bidirectional'] = "Bidirectional";
$string['push'] =   "Push";
$string['WL'] =  'W/L';
$string['A'] =  'A';
$string['plot_color'] =  'Plot color';
$string['plot_offset'] =  'Plot offset';
$string['dc'] =  'dc';

$string['red'] =  'red';
$string['green'] =  'green';
$string['blue'] =  'blue';
$string['cyan'] =  'cyan';
$string['magenta'] =  'magenta';
$string['yellow'] =  'yellow';
$string['orange'] =  'orange';
$string['black'] =  'black';
$string['xaxis'] =  'x axis';

$string['Ics'] =  'Ics';
$string['Ies'] =  'Ies';
$string['alphaF'] =  '\u03B1F';
$string['alphaR'] =  '\u03B1R';
$string['last_line'] =  'last line; no comma';

$string['help'] = "CIRCUIT SANDBOX HELP\n\n";		//embedded Help 
$string['help_addcomponent'] = "Add component: Tap on a part in the parts bin; then tap on the schematic.\n\n";
$string['help_addwire'] = "Add wire: Touch on a connection point (open circle). Drag. Release.\n\n";
$string['help_select']  = "Select: Drag a rectangle to select components. \n(desktop:) Shift-click to include another component.\n\n";
$string['help_move'] = "Move: Touch and drag to a new location.\n\n";
$string['help_delete']  = "Delete: Tap to select; then tap the X icon or hit BACKSPACE.\n\n";
$string['help_rotation'] = "Rotate/Reflect: Click to select; then click on the rotation icon or type the letter \"r\" to rotate 90. Repeat for more rotations and reflections (8 total).\n\n";
$string['help_properties'] = "Properties: Double tap on a component to change its properties.\n\n";
$string['help_number']  = "Numbers may be entered using engineering notation\n";
/*  
   T = 10^12; G = 10^9; M = 10^6; k = 10^3\n\
    m = 10^-3; u = 10^-6; n = 10^-9; p = 10^-12; f = 10^-15";
    */