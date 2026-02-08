<?php
    header('Content-Type: text/json');

    $modules = [];

    $modules[] = [
        'name' => 'Native',
        'version' => '1.7.5',
        'url' => 'Native.zip'
    ];

    echo json_encode($modules);
?>