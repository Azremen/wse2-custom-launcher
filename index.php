<?php
    header('Content-Type: text/json');

    $modules = [];

    $modules[] = [
        'name' => 'Settler Warbands',
        'version' => '0.0.1',
        'url' => 'Settler Warbands.zip'
    ];

    /* $modules[] = [
        'name' => 'Settler Warbands',
        'version' => '0.0.1'
    ]; */

    echo json_encode($modules);
?>