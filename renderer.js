const userPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

$('#toggle-dark-mode').click( async () => {
    const isDarkMode = await darkMode.toggle();

    $("#theme-source").html(isDarkMode ? "Dark" : "Light");
});

$("#theme-source").html(userPrefersDark ? "Dark" : "Light");

function updateProgressbar(perc) {
    if (perc >= 100) {
        $('.progress-bar').addClass('bg-success');
        $('.progress-bar').css('width', '100%');
    } else {
        $('.progress-bar').removeClass('bg-success');
        $('.progress-bar').css('width', perc + '%');
    }
}

if (stored = getData.data()) {
    number = getData.moduleVersion()
    for (i = 0; i < stored.length; i++) {
        $("#list-pos").append("<button class='list-group-item list-group-item-action btn'>" + stored[i] + '<small> - ' + number[i] + "</small></button>");
        //$("#module-img").append('<img src='+ img +'>');

    }
} else {
    console.log('error')
}

function updateModuleIndex(stored, number) {
    if (stored) {
        number = getData.moduleVersion()
        for (i = 0; i < stored.length; i++) {
            $("#list-pos").append("<button class='list-group-item list-group-item-action btn'>" + stored[i] + '<small> - ' + number[i] + "</small></button>");
        }
    }
}

$('#list-pos > button').click(function () {
    $('#list-pos > button.active').removeClass('active');

    var $btn = $(this);

    if ($btn.hasClass('active')) {
        $btn.removeClass('active');
    } else {
        $btn.addClass('active');
    }
    //downloadZipURL.url("http://localhost/Settler Warbands.zip")
});