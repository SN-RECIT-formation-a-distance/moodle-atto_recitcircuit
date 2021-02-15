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
 * @copyright  2013 Damyon Wiese  <damyon@moodle.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

$string['pluginname'] = 'Circuit';
$string['privacy:metadata'] = 'Le plugin Circuit n\'importe pas ou n\'exporte pas de données utilisateurs.';
$string['circuittitle'] = 'Dessiner votre circuit et enregistrer';
$string['insert'] = 'Inserer un Circuit';
$string['settings'] = 'Paramètres  de Circuit';
$string['storeinrepo'] = 'Enregistrer comme un fichier image';
$string['storeinrepo_desc'] = 'Si cette case est cochée; le circuit sera enregisté comme une image standard à la place d\'une  image en ligne base64 .';


$string['error1'] =  'Désolé, une erreur est survenue dans votre navigateur en démarrant les outils schématiques. nous recommandons de prendre Firefox ou Chrome. ';
$string['Ground_connection'] =  'Branchement mise à la Terre';
$string['Node_label'] =  'Node label';
$string['Voltage_source'] =  'Source de tension ';
$string['Current_source'] =  'Source de courant';
$string['Voltage_pile'] =  'Pile';
$string['Voltage_Batterie'] =  'Batterie';
$string['Voltage_Alternatif'] =  'Alternatif';
    $string['Voltage_Prise'] =  'Prise';
$string['Resistor'] =  'Resistor ';
$string['ampoule'] =  'ampoule';
$string['sonore'] =  'Avertisseur sonore';
$string['Resistorvariable'] =  'Resistor variable ';
$string['Interrupteurbascule'] =  'Interrupteur à bascule ';
$string['Capacitor'] =  'Condensateur ';
$string['Inductor'] =  'Inductance ';
$string['Op_Amp'] =  'Op Amp ';
$string['Diode'] =  'Diode ';
$string['NFet'] =  'NFet';
$string['PFet'] =  'PFet';
$string['NPN'] =  'NPN';
$string['PNP'] =  'PNP';
$string['mesure'] = 'Appareil de mesure '; //window.parent.M.str.atto_circuit.mesure
$string['moteur'] = 'Moteur ';
$string['fusible'] = 'Fusible ';
$string['voltmetre'] = 'Voltmètre ';
$string['amperemetre'] = 'Ampèremètre ';
$string['Voltage_probe'] =  'Sonde de différence de potentiel';
$string['Current_probe'] =  'Sonde de courant';
$string['drag_onto_diagram'] =  'Glisser et déposer pour insérer';
$string['Help'] =  'Afficher la page d\'aide.';
$string['Grid']  = 'Afficher/ masquer la grille.';
$string['Link_tip'] = 'share a link to the circuit';
$string['Cut'] =  'Couper le composant sélectionné dans le presse-papier.';
$string['Copy'] = 'Copier le composant sélectionné dans le presse-papier.';
$string['Paste'] = 'Coller le contenu du presse-papier dans le schéma.';
$string['Delete'] = 'Supprimer le composant sélectionné.';
$string['Rotate'] = 'Rotation du composant sélectionné';
$string['Save_netlist'] =  'Save netlist';
$string['Exportasimage_netlist'] =  'Enregistrer comme image';
$string['Open_netlist'] =  'Open netlist';
$string['Select_netlist'] =  'Select netlist';
$string['Perform_DC_Analysis'] =  'Perform a DC Analysis';
$string['DC_Analysis'] =  'DC Analysis';
$string['Perform_AC_Analysis'] =  'Perform an AC Small-Signal Analysis';
$string['Perform_Transient_Analysis'] =  'Perform a Transient Analysis';
$string['Transient_Analysis'] =  'Transient Analysis';
$string['Edit_Properties'] =  'Modifier les  proprités';
$string['Link'] =  'Link';
$string['Sharable_Link'] =  'Sharable link';

$string['points_per_decade'] =  'Number of points/decade';
$string['Starting_frequency'] =  'Starting frequency (Hz)';
$string['Ending_frequency'] =  'Ending frequency (Hz)';	
$string['source_for_ac'] =  'Name of V or I source for ac';
$string['AC_Analysis_add_a_voltage_probe'] =  ' add a voltage probe to the diagram!';
$string['AC_Analysis'] =  'AC Analysis';
$string['Zero_ac_response'] =  'Zero ac response; -infinity on dB scale.';
$string['Near_zero_ac_response'] =  'Near zero ac response; remove ';
$string['probe'] =  ' probe';

// Alerts and warnings from the circuit simulator
$string['Alert'] =  'Alert';
$string['ckt_alert1'] =  'Warning! Circuit has a voltage source loop or a source or current probe shorted by a wire; please remove the source or the wire causing the short.';
$string['ckt_alert2'] =  'Warning! Simulator might produce meaningless results or no result with illegal circuits.';
$string['ckt_warning1'] =  'Warning! Two circuit elements share the same name ';
$string['ckt_alert3'] =  'Please make at least one connection to ground (triangle symbol)';
$string['ckt_alert4'] =  'Newton Method failed; do your current sources have a conductive path to ground?';
$string['ckt_alert5'] =  'Newton Method failed; it may be your circuit or it may be our simulator.';
$string['ckt_alert6'] =  'DC failed; trying transient analysis from zero.';
$string['ckt_alert7'] =  'AC analysis refers to an unknown source; ';
$string['ckt_alert8'] =  'AC analysis failed; unknown source.';	

$string['ckt_error1'] =  'Rows of M mismatched to b or cols mismatch to x.';
$string['ckt_error2'] =  'Row or columns of A too large for B';
$string['ckt_error3'] =  'Row or columns of A too large for C';
$string['ckt_error4'] =  'scalea and scaleb must be scalars or Arrays';
$string['ckt_error5'] =  'Rows or cols > rows or cols of dest';
$string['ckt_error6'] =  'Rows or cols > cols or rows of dest';	    	    

$string['log_Frequency'] =  'log(Frequency in Hz)';
$string['degrees'] =  'degrees';
$string['AC_Phase'] =  'AC Phase';
$string['AC_Magnitude'] =  'AC Magnitude';

$string['Minimum_number_of_timepoints'] =  'Minimum number of time points';
$string['Stop_time_seconds'] =  'Stop time (seconds)';
$string['tstop_lbl'] =  'stop time';
$string['Transient_Analysis_add_a_probe'] =  'add a probe to the diagram!';

//Use creative phrasing to get this sentence to come out right'] =  
// alert('The ' + color + ' probe is connected to node ' + '"' + label + '"' + '; which is not an actual circuit node');
$string['probe_is_connected_to_node'] =  ' probe is connected to node ';
$string['which_is_not_an_actual_circuit_node'] =  '; which is not an actual circuit node.';

$string['Voltage'] =  'Voltage';
$string['Current'] =  'Current';
$string['Time'] =  'Time';
$string['Node_has_two_conflicting_labels'] =  'Node has two conflicting labels:';

$string['DC_value'] =  'DC value';

$string['impulse'] =  'impulse';
$string['Height'] =  'Height';
$string['Width'] =  'Width (secs)';

$string['step'] =  'step';
$string['Initial_value'] =  'Initial value';
$string['Plateau_value'] =  'Plateau value';
$string['Delay_until_step'] =  'Delay until step (secs)';
$string['Rise_time'] =  'Rise time (secs)';

$string['square'] =  'carré';
$string['Frequency'] =  'Frequency (Hz)';
$string['Duty_cycle'] =  'Duty cycle (%)';

$string['triangle'] =  'triangle';

$string['pwl'] =  'pwl';
$string['pwl_repeating'] =  'pwl (repeating)';
$string['Comma_separated_list'] =  'Comma-separated list of alternating times and values';

$string['pulse'] =  'pulse';
$string['Delay_until_pulse'] =  'Delay until pulse (secs)';
$string['Time_for_first_transition'] =  'Time for first transition (secs)';
$string['Time_for_second_transition'] =  'Time for second transition (secs)';
$string['Pulse_width'] =  'Pulse width (secs)';
$string['Period'] =  'Période (secs)';

$string['sin'] =  'sin';
$string['Offset_value'] =  'Offset value';
$string['Amplitude'] =  'Amplitude';
$string['Delay_until_sin_starts'] =  'Delay until sin starts (secs)';
$string['Phase_offset_degrees'] =  'Phase offset (degrees)';

$string['Circuit_Sandbox_Help'] =  'CIRCUIT SANDBOX HELP';
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
$string['DEL'] =  'DEL';
$string['ferme'] =   "Fermé";
$string['ouvert'] =  "Ouvert";
$string['WL'] =  'W/L';
$string['A'] =  'A';
$string['Plot_color'] =  'Plot color';
$string['Plot_offset'] =  'Plot offset';
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
$string['last_line'] =  'last line; no comma';

$string['strSHelp'] = " AIDE CIRCUIT \n\n";		//embedded Help 
    $string['strAddC'] = "Ajouter un composant: Cliquer sur le composant dans la liste puis cliquer sur le schéma. \n\n";
    $string['strAddW'] = "Ajouter un fil: Cliquer sur un poimt de connexion (cercle vide), glisser, relacher.\n\n";
    $string['strSel']  = "Selectionner: Dessiner un rectangle pour selectionner des composants. \n Shift-click pour inclure d\'autres composants. i.\n\n";
    $string['strMove'] = "Déplacer: Cliquer et déplacer.\n\n";
    $string['strDel']  = "Supprimer: Tap to select; then tap the X icon or hit BACKSPACE.\n\n";
    $string['strRot'] = "";//Rotate/Reflect: Click to select; then click on the rotation icon or type the letter \"r\" to rotate 90. Repeat for more rotations and reflections (8 total).\n\n";
    $string['strProp'] = "Propertés: Double-cliquer sur un composant pour modifier ses propriétés.\n\n";
    $string['strNum']  = "";//Numbers may be entered using engineering notation\n"