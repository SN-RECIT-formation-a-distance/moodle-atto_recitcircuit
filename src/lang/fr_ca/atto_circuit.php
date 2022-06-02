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
 * Strings for component 'atto_circuit'; language 'fr'.
 *
 * @package    atto_circuit
 * @copyright (C) 2011 Massachusetts Institute of Technology
 * @copyright (C) 2015-2019 Modifications by Khan Academy and Willy McAllister, Spinning Numbers.
 * @copyright (C) 2021 Adapations for Moodle, RECITFAD https://recitfad.ca .
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

$string['pluginname'] = 'Circuit';
$string['privacy:metadata'] = 'Le plugin Circuit n\'importe pas ou n\'exporte pas de données utilisateurs.';
$string['circuittitle'] = 'Dessiner votre circuit et enregistrer';
$string['insert'] = 'Inserer un Circuit';
$string['settings'] = 'Paramètres de Circuit';
$string['storeinrepo'] = 'Enregistrer comme un fichier image';
$string['storeinrepo_desc'] = 'Si cette case est cochée; le circuit sera enregisté comme une image standard à la place d\'une  image en ligne base64 .';
$string['allusers'] = 'Tout le monde';
$string['teachersonly'] = 'Enseignant seulement';
$string['allowedusers'] = 'Qui a le droit de prendre circuit';
$string['allowedusers_desc'] = 'Peut ouvrir circuit';


$string['error_start'] =  'Désolé, une erreur est survenue dans votre navigateur en démarrant les outils schématiques. nous recommandons de prendre Firefox ou Chrome. ';
$string['ground_connection'] =  'Branchement mise à la Terre';
$string['node_label'] =  'Node label';
$string['voltage_source'] =  'Source de tension ';
$string['current_source'] =  'Source de courant';
$string['voltage_pile'] =  'Pile';
$string['voltage_battery'] =  'Batterie';
$string['alternative_voltage'] =  'Alternatif';
$string['socket_voltage'] =  'Prise';
$string['resistor'] =  'resistor';
$string['speaker'] =  'Haut-parleur';
$string['relay'] =  'Relais';
$string['heatingelement'] =  'Élément chauffant';
$string['cellpic'] =  'Cellule photo-électrique';
$string['buttonswitch'] =  'Interrupteur bouton-poussoir';
$string['magneticswitch'] =  'Interrupteur magnétique';
$string['light'] =  'Ampoule';
$string['sound'] =  'Avertisseur sonore';
$string['resistor_variable'] =  'Resistor variable ';
$string['toggle_switch'] =  'Interrupteur à bascule ';
$string['capacitor'] =  'Condensateur ';
$string['inductor'] =  'Inductance ';
$string['Op_Amp'] =  'Op Amp ';
$string['Diode'] =  'Diode ';
$string['NFet'] =  'NFet';
$string['PFet'] =  'PFet';
$string['NPN'] =  'NPN';
$string['PNP'] =  'PNP';
$string['measurement'] = 'Appareil de mesure '; //window.parent.M.str.atto_circuit.mesure
$string['motor'] = 'Moteur ';
$string['fuse'] = 'Fusible ';
$string['voltmeter'] = 'Voltmètre ';
$string['amperemeter'] = 'Ampèremètre ';
$string['voltage_probe'] =  'Sonde de différence de potentiel';
$string['current_probe'] =  'Sonde de courant';
$string['drag_onto_diagram'] =  'Glisser et déposer pour insérer';
$string['help'] =  'Afficher la page d\'aide.';
$string['grid']  = 'Afficher/ masquer la grille.';
$string['link_tip'] = 'share a link to the circuit';
$string['cut'] =  'Couper le composant sélectionné dans le presse-papier.';
$string['copy'] = 'Copier le composant sélectionné dans le presse-papier.';
$string['paste'] = 'Coller le contenu du presse-papier dans le schéma.';
$string['delete'] = 'Supprimer le composant sélectionné.';
$string['rotate'] = 'Rotation du composant sélectionné';
$string['save_netlist'] =  'Enregistrer netlist';
$string['exportasimage_netlist'] =  'Enregistrer comme image';
$string['open_netlist'] =  'Ouvrire netlist';
$string['select_netlist'] =  'Selectionner netlist';
$string['perform_DC_analysis'] =  'Perform a DC Analysis';
$string['DC_analysis'] =  'DC Analysis';
$string['perform_AC_analysis'] =  'Perform an AC Small-Signal Analysis';
$string['perform_Transient_analysis'] =  'Perform a Transient Analysis';
$string['transient_analysis'] =  'Transient Analysis';
$string['edit_properties'] =  'Modifier les propriétés';
$string['link'] =  'Lien';
$string['sharable_link'] =  'Lien partagable';

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
$string['transient_analysis_add_a_probe'] =  'add a probe to the diagram!';

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

$string['square'] =  'carré';
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
$string['period'] =  'Période (secs)';

$string['sin'] =  'sin';
$string['offset_value'] =  'Offset value';
$string['amplitude'] =  'amplitude';
$string['delay_until_sin_starts'] =  'Delay until sin starts (secs)';
$string['phase_offset_degrees'] =  'Phase offset (degrees)';

$string['circuit_sandbox_help'] =  'CIRCUIT SANDBOX AIDE';
$string['name'] =  'Nom';
$string[' value'] =  'Valeur';
$string['label'] =  'Label';
$string['r'] =  'R';
$string['c'] =  'C';
$string['l'] =  'L';
$string['color'] =  'Couleur';
$string['offset'] =  'Offset';
$string['volt'] =  'Tension';
$string['area'] =  'Area';
$string['type'] =  'Type';
$string['normal'] =  'normal';
$string['led'] =  'led';
$string['ferme'] =   "Fermé";
$string['ouvert'] =  "Ouvert";
$string['WL'] =  'W/L';
$string['A'] =  'A';
$string['plot_color'] =  'Couleur du plot';
$string['plot_offset'] =  'Plot offset';
$string['dc'] =  'dc';

$string['red'] =  'rouge';
$string['green'] =  'Vert';
$string['blue'] =  'bleu';
$string['cyan'] =  'cyan';
$string['magenta'] =  'magenta';
$string['yellow'] =  'jaune';
$string['orange'] =  'orange';
$string['black'] =  'noir';
$string['xaxis'] =  'axe des x ';

$string['Ics'] =  'Ics';
$string['Ies'] =  'Ies';
$string['alphaF'] =  '\u03B1F';
$string['alphaR'] =  '\u03B1R';
$string['last_line'] =  'Dernière ligne; pas de virgule';

$string['help'] = " AIDE CIRCUIT \n\n";		//embedded Help 
$string['help_addcomponent'] = "Ajouter un composant: Cliquer sur le composant dans la liste puis cliquer sur le schéma. \n\n";
$string['help_addwire'] = "Ajouter un fil: Cliquer sur un point de connexion (cercle vide), glisser, relacher.\n\n";
$string['help_select']  = "Selectionner: Dessiner un rectangle pour selectionner des composants. \n Shift-click pour inclure d\'autres composants. i.\n\n";
$string['help_move'] = "Déplacer: Cliquer et déplacer.\n\n";
$string['help_delete']  = "Supprimer: Cliquer sur l'élément et appuyer sur icône X\n\n";
$string['help_rotation'] = "Rotation/Reflection: Cliquer sur l'élément et appuyer sur la touche R de votre clavier.\n\n";
$string['help_properties'] = "Propertés: Double-cliquer sur un composant pour modifier ses propriétés.\n\n";
$string['help_number']  = "Les nombres peuvent être inscrit en notation algébrique\n";