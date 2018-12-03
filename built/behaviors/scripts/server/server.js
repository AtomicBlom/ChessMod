///<reference types="minecraft-scripting-types-server" />
var Server;
(function (Server) {
    var distanceBetweenGames = 32;
    var gameYLevel = 5;
    var system = server.registerSystem(0, 0);
    var gameBoards = [];
    var pieceSets = [
        {
            name: "Overworld" /* Overworld */,
            pieces: {
                king: "minecraft:vindicator",
                queen: "minecraft:witch",
                bishop: "minecraft:evocation_illager",
                knight: "minecraft:creeper",
                rook: "minecraft:slime",
                pawn: "minecraft:zombie"
            }
        }
    ];
    // Setup which events to listen for
    system.initialize = function () {
        system.listenForEvent("chess:join_new_game" /* JoinNewGame */, onJoinNewGame);
        system.listenForEvent("chess:notify_mouse_cursor" /* NotifyMouseCursor */, onNotifyMouseCursor);
    };
    // per-tick updates
    system.update = function () {
        // Any logic that needs to happen every tick on the server.
    };
    function onNotifyMouseCursor(eventData) {
        var gameBoard = gameBoards[eventData.gameId];
        if (!gameBoard)
            return;
        var highlightedBlock = gameBoard.highlightedBlock;
        var startX = (gameBoard.location.x * distanceBetweenGames);
        var startZ = (gameBoard.location.z * distanceBetweenGames);
        eventData.x = Math.floor((eventData.x - startX) / 2);
        eventData.y = 5;
        eventData.z = Math.floor((eventData.z - startZ) / 2);
        if (!!highlightedBlock && highlightedBlock[0] == eventData.x && highlightedBlock[1] == eventData.y && highlightedBlock[2] == eventData.z)
            return;
        if (!!highlightedBlock) {
            var blockType = !!((eventData.x % 2) ^ (eventData.z % 2));
            var block = blockType ? 'concrete 15' : 'concrete 0';
            var command_1 = "/fill " + (startX + highlightedBlock[0] * 2) + " " + gameYLevel + " " + (startX + highlightedBlock[2] * 2) + " " + (startX + highlightedBlock[0] * 2 + 1) + " " + gameYLevel + " " + (startX + highlightedBlock[2] * 2 + 1) + " " + block;
            executeCommand(command_1);
        }
        highlightedBlock = gameBoards[0].highlightedBlock = [eventData.x, eventData.y, eventData.z];
        var command = "/fill " + (startX + highlightedBlock[0] * 2) + " " + gameYLevel + " " + (startX + highlightedBlock[2] * 2) + " " + (startX + highlightedBlock[0] * 2 + 1) + " " + gameYLevel + " " + (startX + highlightedBlock[2] * 2 + 1) + " diamond_block";
        executeCommand(command);
    }
    function onJoinNewGame(player) {
        var game = findNewGame();
        game.players.push(player);
        setPlayerNumber(player, game.players.length, game);
        if (game.players.length == 2) {
            system.broadcastEvent("chess:notify_game_starting" /* GameStarting */, game);
        }
    }
    function setPlayerNumber(player, playerNumber, game) {
        var playerName = system.getComponent(player, "minecraft:nameable" /* Nameable */);
        var playerLocation = playerNumber == 1 ? { x: 7, y: 4, z: -2, rotation: 0 } : { x: 7, y: 4, z: 18, rotation: 180 };
        var movePlayerCommand = "/tp " + playerName.name + " " + (game.location.x * 32 + playerLocation.x) + " " + (gameYLevel + playerLocation.y) + " " + (game.location.z * 32 + playerLocation.z) + " " + playerLocation.rotation + " 40";
        executeCommand(movePlayerCommand);
        system.broadcastEvent("chess:set_player_number" /* SetPlayerNumber */, { player: player, number: playerNumber });
    }
    function findNewGame() {
        var waitingGameBoard = null;
        var furthestExaminedLocation = { x: 0, z: 0 };
        for (var _i = 0, gameBoards_1 = gameBoards; _i < gameBoards_1.length; _i++) {
            var gameBoard = gameBoards_1[_i];
            furthestExaminedLocation = gameBoard.location;
            if (gameBoard.players.length < 2 && !gameBoard.hasStarted) {
                waitingGameBoard = gameBoard;
                break;
            }
        }
        if (waitingGameBoard == null) {
            waitingGameBoard = createGameBoard({
                x: furthestExaminedLocation.x + 1,
                z: furthestExaminedLocation.z
            });
            gameBoards.push(waitingGameBoard);
        }
        return waitingGameBoard;
    }
    function createGameBoard(location) {
        var gameBoard = {
            hasStarted: false,
            location: location,
            players: [],
            highlightedBlock: null
        };
        var startX = (distanceBetweenGames * location.x);
        var startZ = (distanceBetweenGames * location.z);
        system.broadcastEvent("minecraft:display_chat_event" /* DisplayChat */, "Creating new gameboard at " + startX + ", " + startZ);
        var blockType = false;
        executeCommand("/fill " + startX + " " + gameYLevel + " " + startZ + " " + (startX + 16) + " " + gameYLevel + " " + (startZ + 16) + " air");
        for (var z = 0; z < 8; z++) {
            for (var x = 0; x < 8; x++) {
                blockType = !!((x % 2) ^ (z % 2));
                var block = blockType ? 'concrete 15' : 'concrete 0';
                var command = "/fill " + (startX + x * 2) + " " + gameYLevel + " " + (startZ + z * 2) + " " + (startX + x * 2 + 1) + " " + gameYLevel + " " + (startZ + z * 2 + 1) + " " + block;
                executeCommand(command);
            }
        }
        var playerAPieceSet = pieceSets.filter(function (ps) { return ps.name === "Overworld" /* Overworld */; })[0];
        var playerBPieceSet = pieceSets.filter(function (ps) { return ps.name === "Overworld" /* Overworld */; })[0];
        /*
                spawnPiece(playerAPieceSet, Piece.Rook  , startX + 0.5     , startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.Knight, startX + 0.5 +  2, startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.Bishop, startX + 0.5 +  4, startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.King  , startX + 0.5 +  6, startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.Queen , startX + 0.5 +  8, startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.Bishop, startX + 0.5 + 10, startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.Knight, startX + 0.5 + 12, startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.Rook  , startX + 0.5 + 14, startZ + 0.5);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5     , startZ + 0.5 + 2);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  2, startZ + 0.5 + 2);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  4, startZ + 0.5 + 2);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  6, startZ + 0.5 + 2);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  8, startZ + 0.5 + 2);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 + 10, startZ + 0.5 + 2);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 + 12, startZ + 0.5 + 2);
                spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 + 14, startZ + 0.5 + 2);
        
                spawnPiece(playerBPieceSet, Piece.Rook  , startX + 0.5     , startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.Knight, startX + 0.5 +  2, startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.Bishop, startX + 0.5 +  4, startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.King  , startX + 0.5 +  6, startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.Queen , startX + 0.5 +  8, startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.Bishop, startX + 0.5 + 10, startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.Knight, startX + 0.5 + 12, startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.Rook  , startX + 0.5 + 14, startZ + 0.5 + 12);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5     , startZ + 0.5 + 14);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  2, startZ + 0.5 + 14);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  4, startZ + 0.5 + 14);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  6, startZ + 0.5 + 14);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  8, startZ + 0.5 + 14);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 + 10, startZ + 0.5 + 14);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 + 12, startZ + 0.5 + 14);
                spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 + 14, startZ + 0.5 + 14);*/
        return gameBoard;
    }
    function spawnPiece(pieceSet, piece, x, z) {
        var entity = system.createEntity("entity" /* Entity */, pieceSet.pieces[piece]);
        var position = system.getComponent(entity, "minecraft:position" /* Position */);
        position.x = x;
        position.y = gameYLevel + 1;
        position.z = z;
        system.applyComponentChanges(position);
    }
    function executeCommand(command) {
        system.broadcastEvent("minecraft:execute_command" /* ExecuteCommand */, command);
    }
})(Server || (Server = {}));
