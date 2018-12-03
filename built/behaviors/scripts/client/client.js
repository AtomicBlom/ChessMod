///<reference types="minecraft-scripting-types-client" />
var Client;
(function (Client) {
    var system = client.registerSystem(0, 0);
    var thisClient = null;
    var playerNumber = null;
    var playerLocation;
    var pickHitLocation = null;
    var gameBoard;
    // Setup which events to listen for
    system.initialize = function () {
        // set up your listenToEvents and register client-side components here.
        // Setup callback for UI events from the custom screens
        system.listenForEvent("minecraft:ui_event" /* UIEvent */, onUIMessage);
        system.listenForEvent("minecraft:client_entered_world" /* ClientEnteredWorld */, onClientEnteredWorld);
        system.listenForEvent("chess:set_player_number" /* SetPlayerNumber */, onSetPlayerNumber);
        system.listenForEvent("minecraft:hit_result_continuous" /* HitResultContinuous */, onPickHitResultChanged);
        system.listenForEvent("chess:notify_game_starting" /* GameStarting */, onGameStarting);
    };
    system.update = function () {
        if (!!gameBoard && !!gameBoard.location) {
            playerLocation = {
                x: 7 + 32 * gameBoard.location.x,
                y: 9 + 1.7,
                z: (playerNumber == 1 ? -2 : 18) + 32 * gameBoard.location.z,
                rotation: ((playerNumber == 1 ? 0 : 180) * Math.PI / 180.0)
            };
        }
        //playerLocation = playerNumber == 1 ? {x: 7, y: 4, z: -2, rotation: 0} : {x: 7, y: 4, z: 18, rotation: 180}
    };
    function onPickHitResultChanged(eventData) {
        pickHitLocation = eventData.position;
        if (!!pickHitLocation) {
            var mouseData = {
                gameId: 0, x: pickHitLocation.X, y: pickHitLocation.Y, z: pickHitLocation.Z
            };
            system.broadcastEvent("chess:notify_mouse_cursor" /* NotifyMouseCursor */, mouseData);
        }
    }
    function onSetPlayerNumber(eventData) {
        if (eventData.player.id !== thisClient.id)
            return;
        pickHitLocation = null;
        playerNumber = eventData.number;
    }
    function onClientEnteredWorld(eventData) {
        loadUI(UI.Lobby);
        thisClient = eventData;
    }
    function onGameStarting(game) {
        if (!game.players.some(function (p) { return p.id === thisClient.id; }))
            return;
        gameBoard = game;
        loadUI(UI.NewGame);
    }
    function onUIMessage(event) {
        var eventData = JSON.parse(event);
        switch (eventData.name) {
            case "chess:join_game" /* JoinGame */:
                system.broadcastEvent("chess:join_new_game" /* JoinNewGame */, thisClient);
                break;
            case "chess:close_ui" /* CloseUI */:
                unloadUI();
                break;
            case "chess:on_mouse_move" /* MouseMoved */:
            //calculateHitPoint(eventData.data);
        }
    }
    function loadUI(ui) {
        unloadUI();
        system.broadcastEvent("minecraft:load_ui" /* LoadUI */, ui);
    }
    function unloadUI(ui) {
        if (ui === undefined) {
            unloadUI(UI.Lobby);
            unloadUI(UI.NewGame);
        }
        system.broadcastEvent("minecraft:unload_ui" /* UnloadUI */, ui);
    }
    var UI;
    (function (UI) {
        UI["Lobby"] = "chess_start.html";
        UI["NewGame"] = "chess_new_game.html";
    })(UI || (UI = {}));
    function calculateHitPoint(mouseEvent) {
        var wtf = new WTF();
        var pickingRay = new PickingRay();
        var lookAt = new Vector3f(pickHitLocation.X, pickHitLocation.Y, pickHitLocation.Z);
        var playerPosition = new Vector3f(playerLocation.x, playerLocation.y, playerLocation.z);
        wtf.setupViewPort(mouseEvent.screenWidth, mouseEvent.screenHeight);
        wtf.setupViewProjection(playerPosition, lookAt);
        wtf.picking(mouseEvent.x, mouseEvent.y, pickingRay);
        var result = [0, 0, 0];
        var planeNormal = new Vector3f(0, 1, 0);
        var planeOrigin = new Vector3f(0, 6, 0);
        var head = new Vector3f().set(playerPosition);
        var dot = planeNormal.dot(pickingRay.getDirection());
        if (Math.abs(dot) > 0.000001) {
            var w = new Vector3f().set(head).sub(planeOrigin);
            var factor = -planeNormal.dot(w) / dot;
            var planeResult = new Vector3f().set(head).add(new Vector3f().set(pickingRay.getDirection()).scale(factor));
            result[0] = planeResult.x;
            result[1] = planeResult.y;
            result[2] = planeResult.z;
        }
        //pickingRay.intersectionWithXzPlane(result);
        var mouseData = {
            gameId: 0, x: result[0], y: result[1], z: result[2]
        };
        system.broadcastEvent("minecraft:display_chat_event" /* DisplayChat */, JSON.stringify(result));
        system.broadcastEvent("chess:notify_mouse_cursor" /* NotifyMouseCursor */, mouseData);
        system.broadcastEvent("minecraft:send_ui_event" /* SendUIEvent */, {
            eventName: "chess:raytrace",
            data: JSON.stringify(mouseData)
        });
    }
    var WTF = /** @class */ (function () {
        function WTF() {
            this.view = new Vector3f();
            this.screenHorizontally = new Vector3f();
            this.screenVertically = new Vector3f();
        }
        WTF.prototype.setupViewPort = function (width, height) {
            this.viewportWidth = width;
            this.viewportHeight = height;
        };
        WTF.prototype.getViewportAspectRatio = function () {
            return this.viewportWidth / this.viewportHeight;
        };
        WTF.prototype.setupViewProjection = function (position, lookAt) {
            this.position = position;
            var up = new Vector3f(0, 1, 0);
            var viewAngle = 70;
            var nearClippingPlaneDistance = 12.5;
            // look direction
            this.view.subAndAssign(lookAt, position).normalize();
            this.view.z = -this.view.z;
            // screenX
            this.screenHorizontally.crossAndAssign(this.view, up).normalize();
            // screenY
            this.screenVertically.crossAndAssign(this.screenHorizontally, this.view).normalize();
            var radians = (viewAngle * Math.PI / 180.0);
            var halfHeight = (Math.tan(radians / 2) * nearClippingPlaneDistance);
            var halfScaledAspectRatio = halfHeight * this.getViewportAspectRatio();
            this.screenVertically.scale(halfHeight);
            this.screenHorizontally.scale(halfScaledAspectRatio);
        };
        WTF.prototype.picking = function (screenX, screenY, pickingRay) {
            var getClickPosInWorld = pickingRay.getClickPosInWorld();
            var direction = pickingRay.getDirection();
            getClickPosInWorld.set(this.position);
            getClickPosInWorld.add(this.view);
            screenX -= this.viewportWidth / 2;
            screenY -= this.viewportHeight / 2;
            // normalize to 1
            screenX /= (this.viewportWidth / 2);
            screenY /= (this.viewportHeight / 2);
            getClickPosInWorld.x += this.screenHorizontally.x * screenX + this.screenVertically.x * screenY;
            getClickPosInWorld.y += this.screenHorizontally.y * screenX + this.screenVertically.y * screenY;
            getClickPosInWorld.z += this.screenHorizontally.z * screenX + this.screenVertically.z * screenY;
            direction.set(getClickPosInWorld);
            direction.sub(this.position);
        };
        return WTF;
    }());
    var PickingRay = /** @class */ (function () {
        function PickingRay() {
            this.clickPosInWorld = new Vector3f();
            this.direction = new Vector3f();
        }
        /**
         * Computes the intersection of this ray with the X-Y Plane (where Z = 0)
         * and writes it back to the provided vector.
         */
        PickingRay.prototype.intersectionWithXzPlane = function (worldPos) {
            var s = -this.clickPosInWorld.y / this.direction.y;
            worldPos[0] = this.clickPosInWorld.x + this.direction.x * s;
            worldPos[1] = 0;
            worldPos[2] = this.clickPosInWorld.z + this.direction.z * s;
        };
        PickingRay.prototype.getClickPosInWorld = function () {
            return this.clickPosInWorld;
        };
        PickingRay.prototype.getDirection = function () {
            return this.direction;
        };
        return PickingRay;
    }());
    var Vector3f = /** @class */ (function () {
        function Vector3f(x, y, z) {
            if (x === void 0) { x = 0; }
            if (y === void 0) { y = 0; }
            if (z === void 0) { z = 0; }
            this.x = x;
            this.y = y;
            this.z = z;
        }
        Vector3f.prototype.add = function (a) {
            this.x += a.x;
            this.y += a.y;
            this.z += a.z;
            return this;
        };
        Vector3f.prototype.set = function (v) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        };
        Vector3f.prototype.subAndAssign = function (a, b) {
            this.x = a.x - b.x;
            this.y = a.y - b.y;
            this.z = a.z - b.z;
            return this;
        };
        Vector3f.prototype.sub = function (a) {
            this.x -= a.x;
            this.y -= a.y;
            this.z -= a.z;
            return this;
        };
        Vector3f.prototype.dot = function (a) {
            return this.x * a.x + this.y * a.y + this.z * a.z;
        };
        /**
         * Returns the length of the vector, also called L2-Norm or Euclidean Norm.
         */
        Vector3f.prototype.l2Norm = function () {
            return Math.sqrt(this.x * this.x +
                this.y * this.y +
                this.z * this.z);
        };
        Vector3f.prototype.crossAndAssign = function (a, b) {
            var tempX = a.y * b.z - a.z * b.y;
            var tempY = a.z * b.x - a.x * b.z;
            var tempZ = a.x * b.y - a.y * b.x;
            this.x = tempX;
            this.y = tempY;
            this.z = tempZ;
            return this;
        };
        Vector3f.prototype.scale = function (scalar) {
            this.x *= scalar;
            this.y *= scalar;
            this.z *= scalar;
            return this;
        };
        Vector3f.prototype.normalize = function () {
            var length = this.l2Norm();
            this.x /= length;
            this.y /= length;
            this.z /= length;
            return this;
        };
        return Vector3f;
    }());
})(Client || (Client = {}));
