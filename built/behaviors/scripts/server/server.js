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
    };
    // per-tick updates
    system.update = function () {
        // Any logic that needs to happen every tick on the server.
    };
    function onJoinNewGame(player) {
        var game = findNewGame();
        game.players.push(player);
        var playerName = system.getComponent(player, "minecraft:nameable" /* Nameable */);
        var playerLocation = game.players.indexOf(player) == 0 ? { x: 7, y: 4, z: -2 } : { x: 0, y: 0, z: 0 };
        var movePlayerCommand = "/tp " + playerName.name + " " + (game.location.x * 32 + playerLocation.x) + " " + (gameYLevel + playerLocation.y) + " " + (game.location.z * 32 + playerLocation.z) + " 0 40";
        executeCommand(movePlayerCommand);
        if (game.players.length == 2) {
            system.broadcastEvent("chess:notify_game_starting" /* GameStarting */, game);
        }
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
            players: []
        };
        var startX = (distanceBetweenGames * location.x);
        var startZ = (distanceBetweenGames * location.z);
        system.broadcastEvent("minecraft:display_chat_event" /* DisplayChat */, "Creating new gameboard at " + startX + ", " + startZ);
        var blockType = false;
        for (var z = startZ; z < startZ + 16; z += 2) {
            blockType = !blockType;
            for (var x = startX; x < startX + 16; x += 2) {
                blockType = !blockType;
                var block = blockType ? 'concrete 15' : 'concrete 0';
                var command = "/fill " + x + " " + gameYLevel + " " + z + " " + (x + 1) + " " + gameYLevel + " " + (z + 1) + " " + block;
                executeCommand(command);
            }
        }
        var playerAPieceSet = pieceSets.filter(function (ps) { return ps.name === "Overworld" /* Overworld */; })[0];
        var playerBPieceSet = pieceSets.filter(function (ps) { return ps.name === "Overworld" /* Overworld */; })[0];
        spawnPiece(playerAPieceSet, "rook" /* Rook */, startX + 0.5, startZ + 0.5);
        spawnPiece(playerAPieceSet, "knight" /* Knight */, startX + 0.5 + 2, startZ + 0.5);
        spawnPiece(playerAPieceSet, "bishop" /* Bishop */, startX + 0.5 + 4, startZ + 0.5);
        spawnPiece(playerAPieceSet, "king" /* King */, startX + 0.5 + 6, startZ + 0.5);
        spawnPiece(playerAPieceSet, "queen" /* Queen */, startX + 0.5 + 8, startZ + 0.5);
        spawnPiece(playerAPieceSet, "bishop" /* Bishop */, startX + 0.5 + 10, startZ + 0.5);
        spawnPiece(playerAPieceSet, "knight" /* Knight */, startX + 0.5 + 12, startZ + 0.5);
        spawnPiece(playerAPieceSet, "rook" /* Rook */, startX + 0.5 + 14, startZ + 0.5);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5 + 2, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5 + 4, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5 + 6, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5 + 8, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5 + 10, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5 + 12, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, "pawn" /* Pawn */, startX + 0.5 + 14, startZ + 0.5 + 2);
        spawnPiece(playerBPieceSet, "rook" /* Rook */, startX + 0.5, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "knight" /* Knight */, startX + 0.5 + 2, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "bishop" /* Bishop */, startX + 0.5 + 4, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "king" /* King */, startX + 0.5 + 6, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "queen" /* Queen */, startX + 0.5 + 8, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "bishop" /* Bishop */, startX + 0.5 + 10, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "knight" /* Knight */, startX + 0.5 + 12, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "rook" /* Rook */, startX + 0.5 + 14, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5 + 2, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5 + 4, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5 + 6, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5 + 8, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5 + 10, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5 + 12, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, "pawn" /* Pawn */, startX + 0.5 + 14, startZ + 0.5 + 14);
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
