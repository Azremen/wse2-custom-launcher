$('#toggle-dark-mode').click( function() {
    const isDarkMode = window.darkMode.toggle();

    $("body").toggleClass("dark", isDarkMode);

    $("#theme-source").html(isDarkMode ? 'Dark' : 'Light');

    $("#list-pos > a").html(isDarkMode ? "Light" : "Dark");
});

const userPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

$("#theme-source").html(userPrefersDark ? 'Dark' : 'Light');

$("#list-pos > button").html(userPrefersDark ? "Dark" : "Light");

function updateProgressbar(perc) {
    if(perc >= 100) {
        $('.progress-bar').addClass('bg-success');
        $('.progress-bar').css('width', '100%');
    } else {
        $('.progress-bar').removeClass('bg-success');
        $('.progress-bar').css('width', perc + '%');
    }
}

stored = getData.data();

for (i = 0; i < stored.length; i++) {
    $("#list-pos").append("<button class='list-group-item list-group-item-action btn'>"+ stored[i] + "</button>");
}

$('#list-pos > button').click( function() {
    $('#list-pos > button.active').removeClass('active');
    var $btn = $(this);
    if($btn.hasClass('active')) {
        $btn.removeClass('active');
    } else {
        $btn.addClass('active');
    }
    //downloadZipURL.url("http://localhost/Settler Warbands.zip")
});