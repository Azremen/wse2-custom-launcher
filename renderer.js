const userPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

$('#toggle-dark-mode').click(async () => {
    const isDarkMode = await darkMode.toggle();

    $("#theme-source").html(isDarkMode ? "Dark" : "Light");
});

$("#theme-source").html(userPrefersDark ? "Dark" : "Light");

function updateProgressbar(perc) {
    if (perc >= 100) {
        $('.progress-bar').addClass('bg-success');
        $('.progress-bar').css('width', '100%');
        $(".progress-bar").html("Done");
    } else {
        $('.progress-bar').removeClass('bg-success');
        $('.progress-bar').css('width', perc + '%');
        $(".progress-bar").html(perc + '%');
    }
}

var url = 'http://localhost/';
var listing = null, downloadedModules = null;
//console.log(listing)

var activeModule = null;
if (getData.data() !== undefined) {
    var modules = getData.data()
    renderList();
} else {
    console.log('error');
}

$.ajax({
    url: url,
    success: function (data) {
        //console.log(data)
        downloadedModules = data;
        renderList();
    },
    dataType: 'json',
    method: 'GET',
    timeout: 5000, // in 5 seconds
    error: function () { //if connection has not been established
        renderList()
    },
});

function renderList() {
    listing = JSON.parse(JSON.stringify(downloadedModules));
    if (modules != null) {
        $("#list-pos").html('');
        var t = "";
        modules.forEach(function (module, mi) {
            t += "<button class='list-group-item list-group-item-action btn'>";
            t += '<span class="name">' + module.name + '</span>';
            if (module.version == null) {
                t += '<span class="badge badge-dark float-right">?</span>';
            } else {
                var hasNewVersion = false;
                if (listing != null) {
                    listing.forEach(function (list, li) {
                        if (module.name == list.name) {
                            hasNewVersion = list.version != module.version;
                            modules[mi].url = list.url;
                            listing.splice(li, 1);
                        }
                    })
                }
                if (hasNewVersion) {
                    t += '<span class="badge badge-warning float-right">' + module.version + "</span>";
                } else {
                    t += '<span class="badge badge-success float-right">' + module.version + "</span>";
                }
            }
            t += "</button>";
        })
        if (listing != null) {
            listing.forEach(function (list) {
                t += "<button class='list-group-item list-group-item-action btn'>";
                t += '<span class="name">' + list.name + '</span>';
                t += '<span class="badge badge-success float-right">' + list.version + "</span>";
                t += "</button>";
            })
        }
        $("#list-pos").append(t);
        $listBtns = $('#list-pos > button');
        $listBtns.off('click', listClickAction)
        $listBtns.on('click', listClickAction)
    }
}

result = getData.launcherVersion();

$("#version").append('<strong>WSE2 Launcher Version</strong>: ' + result);

var $installBtn = $('#btn-install');

var $removeBtn = $('#btn-remove');

var $confBtn = $('#btn-configure');

var $listBtns = $('#list-pos > button');

var listClickAction = function () {
    $listBtns.filter('.active').removeClass('active');

    var $btn = $(this);
    var btnIndex = $listBtns.index($btn);
    var btnName = $btn.find('.name').html();
    $btn.addClass('active');
    activeModule = modules[btnIndex];
    if (activeModule == undefined) {
        listing.forEach(function (list, li) {
            if (btnName == list.name) {
                activeModule = list;
                listing[li] = list;
            }
        })
    }
    if (activeModule != undefined && activeModule.img == true) {
        $('#module-img').attr('src', activeModule.path + '/main.bmp').toggleClass('d-none', false);
        $installBtn.prop('disabled', activeModule.version == null);
    } else {
        $('#module-img').toggleClass('d-none', true);
    }
}

$installBtn.click(function () {
    if (activeModule != null) {
        downloadZipURL.url(activeModule.url)
    }
})

$removeBtn.click(function () {
    if (activeModule != null) {
        removeModule.module(activeModule.path)
    }
})

$confBtn.click(function () {
    if (activeModule != null) {
        openConfig.config();
    }
})