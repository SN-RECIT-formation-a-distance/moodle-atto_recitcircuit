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

$ADMIN->add('editoratto', new admin_category('atto_circuit', new lang_string('pluginname', 'atto_circuit')));

$settings = new admin_settingpage('atto_circuit_settings', new lang_string('settings', 'atto_circuit'));
if ($ADMIN->fulltree) {
    // Number of groups to show when collapsed.
    $name = new lang_string('storeinrepo', 'atto_circuit');
    $desc = new lang_string('storeinrepo_desc', 'atto_circuit');

    $setting = new admin_setting_configcheckbox('atto_circuit/storeinrepo',
                                                $name,
                                                $desc,
                                                0);
    $settings->add($setting);
    
    $options = array(
        'allusers' => new lang_string('allusers', 'atto_circuit'),
        'teachersonly' => new lang_string('teachersonly', 'atto_circuit'),
            );
    $name = get_string('allowedusers', 'atto_circuit');
    $desc = get_string('allowedusers_desc', 'atto_circuit');
    $default = 'teachersonly';
    $setting = new admin_setting_configselect('atto_circuit/allowedusers', $name, $desc, $default, $options);
    $settings->add($setting);

}