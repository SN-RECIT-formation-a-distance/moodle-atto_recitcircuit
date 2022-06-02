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
                                          'insert','measurement','error_start', 'light','alternative_voltage','socket_voltage','sound',
                                          'ground_connection',
                                          'node_label',
                                          'voltage_source',
                                          'current_source',
                                          'voltage_pile',
                                          'volt',
                                          'voltage_battery',
                                          'resistor',
                                          'resistor_variable',
                                          'toggle_switch',
                                          'capacitor',
                                          'inductor',
                                          'Op_Amp',
                                          'Diode',
                                          'NFet',
                                          'PFet',
                                          'NPN',
                                          'PNP',
                                          'measurement',
                                          'motor',
                                          'fuse',
                                          'voltmeter',
                                          'amperemeter',
                                          'ohmmetre',
                                          'voltage_probe',
                                          'current_probe',
                                          'drag_onto_diagram',
                                          'help',
                                          'grid',
                                          'link_tip',
                                          'cut',
                                          'copy',
                                          'paste',
                                          'delete',
                                          'rotate',
                                          'save_netlist',
                                          'exportasimage_netlist',
                                          'open_netlist',
                                          'select_netlist',
                                          'perform_DC_analysis',
                                          'DC_analysis',
                                          'perform_AC_analysis',
                                          'perform_Transient_analysis',
                                          'transient_analysis',
                                          'edit_properties',
                                          'link',
                                          'sharable_link',
                                          'points_per_decade',
                                          'starting_frequency',
                                          'ending_frequency',
                                          'source_for_ac',
                                          'AC_analysis_add_a_voltage_probe',
                                          'AC_analysis',
                                          'zero_ac_response',
                                          'near_zero_ac_response',
                                          'probe',
                                          'alert',
                                          'ckt_alert_shortcircuit',
                                          'ckt_alert_meaningless',
                                          'ckt_warning_samename',
                                          'ckt_alert_noground',
                                          'ckt_alert_newtonfailed1',
                                          'ckt_alert_newtonfailed2',
                                          'ckt_alert_dcfailed',
                                          'ckt_alert_acunknownsource',
                                          'ckt_alert_acanalysisfailed',
                                          'ckt_error_rowsmismatch',
                                          'ckt_error_rowatoolargeforb',
                                          'ckt_error_rowatoolargeforc',
                                          'ckt_error_noscalar',
                                          'ckt_error_rowexceedcol',
                                          'ckt_error_colexceedrow',
                                          'log_frequency',
                                          'degrees',
                                          'AC_phase',
                                          'AC_magnitude',
                                          'minimum_number_of_timepoints',
                                          'stop_time_seconds',
                                          'stop_time',
                                          'transient_analysis_add_a_probe',
                                          'probe_is_connected_to_node',
                                          'which_is_not_an_actual_circuit_node',
                                          'voltage',
                                          'current',
                                          'time',
                                          'node_has_two_conflicting_labels',
                                          'DC_value',
                                          'impulse',
                                          'height',
                                          'width',
                                          'step',
                                          'initial_value',
                                          'plateau_value',
                                          'delay_until_step',
                                          'rise_time',
                                          'square',
                                          'Frequency',
                                          'duty_cycle',
                                          'triangle',
                                          'pwl',
                                          'pwl_repeating',
                                          'comma_separated_list',
                                          'pulse',
                                          'delay_until_pulse',
                                          'time_for_first_transition',
                                          'time_for_second_transition',
                                          'pulse_width',
                                          'period',
                                          'sin',
                                          'offset_value',
                                          'amplitude',
                                          'delay_until_sin_starts',
                                          'phase_offset_degrees',
                                          'circuit_sandbox_help',
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
                                          'led',
                                          'closed',
                                          'open','push', 'magnetic', 'bidirectional',
                                          'WL',
                                          'A',
                                          'plot_color',
                                          'plot_offset',
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
                                          'help',
                                          'help_addcomponent', 
                                        'help_addwire', 
                                        'help_select',  
                                        'help_move', 
                                        'help_delete',  
                                        'help_rotation',
                                        'help_properties', 
                                        'help_number',
                                        'speaker',
                                        'relay',
                                        'heatingelement',
                                        'cellpic',
                                        'buttonswitch',
                                        'magneticswitch',
                                          ),
                                    'atto_circuit');
}

/**
 * Set params for this plugin
 * @param string $elementid
 */
function atto_circuit_params_for_js($elementid, $options, $fpoptions) {
    global $USER;
    $context = $options['context'];
    if (!$context) {
        $context = context_system::instance();
    }
    $allowedusers = get_config('atto_circuit', 'allowedusers');
    
    $allowed = 0;
    // Update $allowedtypes to account for capabilities.
    if ($allowedusers === 'teachersonly' && has_capability('atto/recitcircuit:teacher', $context, $USER->id, false)){
        $allowed = 1;
    } 
    else if ($allowedusers === 'allusers') {
        $allowed = 1;
    }

   
    $storeinrepo = 1;//get_config('atto_circuit', 'storeinrepo')
    // Pass the number of visible groups as a param.
    $params = array('storeinrepo' => $storeinrepo,
                    'allowed' => $allowed);

    return $params;
}