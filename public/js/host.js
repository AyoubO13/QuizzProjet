var socket = io();
var params = jQuery.deparam(window.location.search);

//Lorsque l'hôte se connecte au serveur
socket.on('connect', function() {

    document.getElementById('players').value = "";
    
    //Indiquer au serveur qu'il s'agit d'une connexion hôte
    socket.emit('host-join', params);
});

socket.on('showGamePin', function(data){
   document.getElementById('gamePinText').innerHTML = data.pin;
});

//Ajoute le nom du joueur à l'écran et met à jour le nombre de joueurs
socket.on('updatePlayerLobby', function(data){
    
    document.getElementById('players').value = "";
    
    for(var i = 0; i < data.length; i++){
        document.getElementById('players').value += data[i].name + "\n";
    }
    
});

//Dire au serveur de démarrer le jeu si le bouton est cliqué.
function startGame(){

    socket.emit('startGame');
}
function endGame(){
    window.location.href = "/";
}

//Lorsque le serveur démarre le jeu
socket.on('gameStarted', function(id){
    console.log('Game Started!');
    window.location.href="/host/game/" + "?id=" + id;
});

socket.on('noGameFound', function(){
   window.location.href = '../../';
});

