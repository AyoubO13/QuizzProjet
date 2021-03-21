var socket = io();

//Lorsque le joueur se connecte au serveur
socket.on('connect', function() {
    
    var params = jQuery.deparam(window.location.search); //Récupère les données de l'url
    
    
    socket.emit('player-join', params);
});


socket.on('noGameFound', function(){
    window.location.href = '../';
});
//Si l'hôte se déconnecte, le joueur retourne à l'écran principal
socket.on('hostDisconnect', function(){
    window.location.href = '../';
});

//Lorsque l'hôte clique sur démarrer le jeu, l'écran du joueur change
socket.on('gameStartedPlayer', function(){
    window.location.href="/player/game/" + "?id=" + socket.id;
});


