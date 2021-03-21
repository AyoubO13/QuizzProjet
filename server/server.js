//Importer les dépendances
const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');

//Importer les classes 
const {LiveGames} = require('./utils/liveGames');
const {Players} = require('./utils/players');

const publicPath = path.join(__dirname, '../public');
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var games = new LiveGames();
var players = new Players();

//Mongodb configuration
var MongoClient = require('mongodb').MongoClient;
var mongoose = require('mongoose');
var url = "mongodb://localhost:27017/";



app.use(express.static(publicPath));

//Démarrage du serveur sur le port 3000
server.listen(3000, () => {
    console.log("Server started on port 3000");
});

//Lorsqu'une connexion au serveur est établie par le client
io.on('connection', (socket) => {
    
    //Lorsque l'hôte se connecte pour la première fois
    socket.on('host-join', (data) =>{
        
        //Vérifiez si l'identifiant passé dans l'url correspond à l'identifiant du jeu de quiz dans la base de données
        MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var dbo = db.db("quizzDB");
            var query = { id:  parseInt(data.id)};
            dbo.collection('questionnaires').find(query).toArray(function(err, result){
                if(err) throw err;
                
                //Un quiz a été trouvé avec l'id passé dans url
                if(result[0] !== undefined){
                    var gamePin = Math.floor(Math.random()*90000) + 10000; //Nouveau pin pour le jeu/la session

                    games.addGame(gamePin, socket.id, false, {playersAnswered: 0, questionLive: false, gameid: data.id, question: 1}); //Creates a game with pin and host id

                    var game = games.getGame(socket.id); //Obtient les données du jeu

                    socket.join(game.pin);//l'hôte rejoint une session via le code pin

                    

                    //Envoi du code de jeu à l'hôte afin qu'il puisse l'afficher pour que les joueurs puissent s'y joindre
                    socket.emit('showGamePin', {
                        pin: game.pin
                    });
                }else{
                    socket.emit('noGameFound');
                }
                db.close();
            });
        });
        
    });
    
    //Lorsque l'hôte se connecte depuis la vue du jeu
    socket.on('host-join-game', (data) => {
        var oldHostId = data.id;
        var game = games.getGame(oldHostId);//Récupère le jeu avec l'ancien identifiant de l'hôte
        if(game){
            game.hostId = socket.id;//Change l'identifiant de l'hôte du jeu en un nouvel identifiant d'hôte
            socket.join(game.pin);
            var playerData = players.getPlayers(oldHostId);
            for(var i = 0; i < Object.keys(players.players).length; i++){
                if(players.players[i].hostId == oldHostId){
                    players.players[i].hostId = socket.id;
                }
            }
            var gameid = game.gameData['gameid'];
            MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('quizzDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("questionnaires").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    
                    var question = res[0].questions[0].question;
                    var answer1 = res[0].questions[0].answers[0];
                    var answer2 = res[0].questions[0].answers[1];
                    var answer3 = res[0].questions[0].answers[2];
                    var answer4 = res[0].questions[0].answers[3];
                    var correctAnswer = res[0].questions[0].correct;
                    
                    socket.emit('gameQuestions', {
                        q1: question,
                        a1: answer1,
                        a2: answer2,
                        a3: answer3,
                        a4: answer4,
                        correct: correctAnswer,
                        playersInGame: playerData.length
                    });
                    db.close();
                });
            });
            
            
            io.to(game.pin).emit('gameStartedPlayer');
            game.gameData.questionLive = true;
        }else{
            socket.emit('noGameFound');//Aucun jeu n'a été trouvé, rediriger l'utilisateur
        }
    });
    
    //Lorsque le joueur se connecte pour la première fois
    socket.on('player-join', (params) => {
        
        var gameFound = false; //si un jeu est trouvé avec le pin fourni par le joueur
        
        //pour chaque jeu de la classe jeux
        for(var i = 0; i < games.games.length; i++){
           
            // si le pin est égale à l'un des pin de la partie
            if(params.pin == games.games[i].pin){
                
                
                
                var hostId = games.games[i].hostId; //on recupère l'id de l'hôte du jeu
                
                
                players.addPlayer(hostId, socket.id, params.name, {score: 0, answer: 0}); //add player to game
                
                socket.join(params.pin); //le joueur rejoint la session via le pin
                
                var playersInGame = players.getPlayers(hostId); 
                
                io.to(params.pin).emit('updatePlayerLobby', playersInGame);//envoi les données du joueur hôte à l'écran
                gameFound = true; //Le jeu a été trouvé
            }
        }
        
        //Si le jeu n'a pas été trouvé
        if(gameFound == false){
            socket.emit('noGameFound'); //Le joueur est renvoyé à la page "rejoindre" parce que le jeu n'a pas été trouvé avec le code d'accès.


        }
        
        
    });
    
    //Lorsque le joueur se connecte depuis la vue du jeu
    socket.on('player-join-game', (data) => {
        var player = players.getPlayer(data.id);
        if(player){
            var game = games.getGame(player.hostId);
            socket.join(game.pin);
            player.playerId = socket.id;//maj id joueur avec socket id
            
            var playerData = players.getPlayers(game.hostId);
            socket.emit('playerGameData', playerData);
        }else{
            socket.emit('noGameFound');//pas de joueur trouvé
        }
        
    });
    
    //Lorsqu'un hôte ou un joueur quitte le site
    socket.on('disconnect', () => {
        var game = games.getGame(socket.id); //jeu trouvé avec socket.id
        //Si un jeu hébergé par cet identifiant est trouvé, la socket déconnectée est un hôte

        if(game){
            //Vérification pour voir si l'hôte a été déconnecté ou a été envoyé à la vue du jeu
            if(game.gameLive == false){
                games.removeGame(socket.id);//retirer le jeu
                

                var playersToRemove = players.getPlayers(game.hostId);

                //Pour chaque joueur du jeu
                for(var i = 0; i < playersToRemove.length; i++){
                    players.removePlayer(playersToRemove[i].playerId); //Retirer chaque joueur de la classe joueurs
                }

                io.to(game.pin).emit('hostDisconnect'); //Renvoyer au joueur à l'écran "rejoindre"
                socket.leave(game.pin); 
            }
        }else{
            //Aucun jeu n'a été trouvé, c'est le socket joueur qui s'est déconnecté
            var player = players.getPlayer(socket.id); //obtenir un joueur avec socket.id
            //Si un joueur a été trouvé avec cet id
            if(player){
                var hostId = player.hostId;//Obtient l'id de l'hôte du jeu
                var game = games.getGame(hostId);//obtient données du jeu avec hostId
                var pin = game.pin;//obtient le pin du jeu
                
                if(game.gameLive == false){
                    players.removePlayer(socket.id);
                    var playersInGame = players.getPlayers(hostId);//joueurs restants

                    io.to(pin).emit('updatePlayerLobby', playersInGame);//Envoie des données à l'hôte pour mettre à jour l'écran
                    socket.leave(pin); //le joueur quitte la session
            
                }
            }
        }
        
    });
    
    //Définit les données dans la classe joueur pour répondre au joueur
    socket.on('playerAnswer', function(num){
        var player = players.getPlayer(socket.id);
        var hostId = player.hostId;
        var playerNum = players.getPlayers(hostId);
        var game = games.getGame(hostId);
        if(game.gameData.questionLive == true){//si la question est toujours en cours
            player.gameData.answer = num;
            game.gameData.playersAnswered += 1;
            
            var gameQuestion = game.gameData.question;
            var gameid = game.gameData.gameid;
            
            MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('quizzDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("questionnaires").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    var correctAnswer = res[0].questions[gameQuestion - 1].correct;
                    //Vérifie la réponse du joueur avec la bonne réponse
                    if(num == correctAnswer){
                        player.gameData.score += 100;
                        io.to(game.pin).emit('getTime', socket.id);
                        socket.emit('answerResult', true);
                    }

                    //Vérifie si tous les joueurs ont répondu
                    if(game.gameData.playersAnswered == playerNum.length){
                        game.gameData.questionLive = false; //La question est terminée car tous les joueurs ont répondu dans les temps
                        var playerData = players.getPlayers(game.hostId);
                        io.to(game.pin).emit('questionOver', playerData, correctAnswer);
                    }else{
                      
                        io.to(game.pin).emit('updatePlayersAnswered', {
                            playersInGame: playerNum.length,
                            playersAnswered: game.gameData.playersAnswered
                        });
                    }
                    
                    db.close();
                });
            });
            
            
            
        }
    });
    
    socket.on('getScore', function(){
        var player = players.getPlayer(socket.id);
        socket.emit('newScore', player.gameData.score); 
    });
    
    socket.on('time', function(data){
        var time = data.time / 20;
        time = time * 100;
        var playerid = data.player;
        var player = players.getPlayer(playerid);
        player.gameData.score += time;
    });
    
    
    
    socket.on('timeUp', function(){
        var game = games.getGame(socket.id);
        game.gameData.questionLive = false;
        var playerData = players.getPlayers(game.hostId);
        
        var gameQuestion = game.gameData.question;
        var gameid = game.gameData.gameid;
            
            MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('quizzDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("questionnaires").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    var correctAnswer = res[0].questions[gameQuestion - 1].correct;
                    io.to(game.pin).emit('questionOver', playerData, correctAnswer);
                    
                    db.close();
                });
            });
    });
    
    socket.on('nextQuestion', function(){
        var playerData = players.getPlayers(socket.id);
        //Remettre la réponse actuelle des joueurs à 0
        for(var i = 0; i < Object.keys(players.players).length; i++){
            if(players.players[i].hostId == socket.id){
                players.players[i].gameData.answer = 0;
            }
        }
        
        var game = games.getGame(socket.id);
        game.gameData.playersAnswered = 0;
        game.gameData.questionLive = true;
        game.gameData.question += 1;
        var gameid = game.gameData.gameid;
        
        
        
        MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('quizzDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("questionnaires").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    
                    if(res[0].questions.length >= game.gameData.question){
                        var questionNum = game.gameData.question;
                        questionNum = questionNum - 1;
                        var question = res[0].questions[questionNum].question;
                        var answer1 = res[0].questions[questionNum].answers[0];
                        var answer2 = res[0].questions[questionNum].answers[1];
                        var answer3 = res[0].questions[questionNum].answers[2];
                        var answer4 = res[0].questions[questionNum].answers[3];
                        var correctAnswer = res[0].questions[questionNum].correct;

                        socket.emit('gameQuestions', {
                            q1: question,
                            a1: answer1,
                            a2: answer2,
                            a3: answer3,
                            a4: answer4,
                            correct: correctAnswer,
                            playersInGame: playerData.length
                        });
                        db.close();
                    }else{
                        var playersInGame = players.getPlayers(game.hostId);
                        var first = {name: "", score: 0};
                        var second = {name: "", score: 0};
                        var third = {name: "", score: 0};
                        var fourth = {name: "", score: 0};
                        var fifth = {name: "", score: 0};
                        
                        for(var i = 0; i < playersInGame.length; i++){
                           
                            if(playersInGame[i].gameData.score > fifth.score){
                                if(playersInGame[i].gameData.score > fourth.score){
                                    if(playersInGame[i].gameData.score > third.score){
                                        if(playersInGame[i].gameData.score > second.score){
                                            if(playersInGame[i].gameData.score > first.score){
                                                //1ere place
                                                fifth.name = fourth.name;
                                                fifth.score = fourth.score;
                                                
                                                fourth.name = third.name;
                                                fourth.score = third.score;
                                                
                                                third.name = second.name;
                                                third.score = second.score;
                                                
                                                second.name = first.name;
                                                second.score = first.score;
                                                
                                                first.name = playersInGame[i].name;
                                                first.score = playersInGame[i].gameData.score;
                                            }else{
                                                //2eplace
                                                fifth.name = fourth.name;
                                                fifth.score = fourth.score;
                                                
                                                fourth.name = third.name;
                                                fourth.score = third.score;
                                                
                                                third.name = second.name;
                                                third.score = second.score;
                                                
                                                second.name = playersInGame[i].name;
                                                second.score = playersInGame[i].gameData.score;
                                            }
                                        }else{
                                            //3e place
                                            fifth.name = fourth.name;
                                            fifth.score = fourth.score;
                                                
                                            fourth.name = third.name;
                                            fourth.score = third.score;
                                            
                                            third.name = playersInGame[i].name;
                                            third.score = playersInGame[i].gameData.score;
                                        }
                                    }else{
                                        //4e place
                                        fifth.name = fourth.name;
                                        fifth.score = fourth.score;
                                        
                                        fourth.name = playersInGame[i].name;
                                        fourth.score = playersInGame[i].gameData.score;
                                    }
                                }else{
                                    //6eplace
                                    fifth.name = playersInGame[i].name;
                                    fifth.score = playersInGame[i].gameData.score;
                                }
                            }
                        }
                        
                        io.to(game.pin).emit('GameOver', {
                            num1: first.name,
                            num2: second.name,
                            num3: third.name,
                            num4: fourth.name,
                            num5: fifth.name
                        });
                    }
                });
            });
        
        io.to(game.pin).emit('nextQuestionPlayer');
    });
    
    //Quand l'hôte commence le jeu
    socket.on('startGame', () => {
        
        var game = games.getGame(socket.id);
        game.gameLive = true;
        socket.emit('gameStarted', game.hostId);//Indiquer au joueur et à l'hôte que le jeu a commencé
    });
    
    
    socket.on('requestDbNames', function(){
        
        MongoClient.connect(url, function(err, db){
            if (err) throw err;
    
            var dbo = db.db('quizzDB');
            dbo.collection("questionnaires").find().toArray(function(err, res) {
                if (err) throw err;
                socket.emit('gameNamesData', res);
                db.close();
            });
        });
        
         
    });
    
    
    socket.on('newQuiz', function(data){
        MongoClient.connect(url, function(err, db){
            if (err) throw err;
            var dbo = db.db('quizzDB');
            dbo.collection('questionnaires').find({}).toArray(function(err, result){
                if(err) throw err;
                var num = Object.keys(result).length;
                if(num == 0){
                	data.id = 1
                	num = 1
                }else{
                	data.id = result[num -1 ].id + 1;
                }
                var game = data;
                dbo.collection("questionnaires").insertOne(game, function(err, res) {
                    if (err) throw err;
                    db.close();
                });
                db.close();
                socket.emit('startGameFromCreator', num);
            });
            
        });
        
        
    });
    
});
