///<reference types="minecraft-scripting-types-client" />

import { ChessEvents, SetPlayerNumberData, ChessUIEvents, UIEventData, MouseMoveUIEventData, NotifyMouseCursor } from '../events';
import { PlayerLocation } from '../maths';
import { GameBoard } from '../chess'

namespace Client {
    const system = client.registerSystem(0, 0);
    let thisClient: IEntityObject = null
    let playerNumber: number = null;
    let playerLocation: PlayerLocation;
    let pickHitLocation: {X: number, Y: number, Z: number} = null;
    let gameBoard: GameBoard;

    // Setup which events to listen for
    system.initialize = function () {
        // set up your listenToEvents and register client-side components here.
            // Setup callback for UI events from the custom screens
        system.listenForEvent(ReceiveFromMinecraftClient.UIEvent, onUIMessage);
        system.listenForEvent(ReceiveFromMinecraftClient.ClientEnteredWorld, onClientEnteredWorld);
        system.listenForEvent(ChessEvents.SetPlayerNumber, onSetPlayerNumber);
        system.listenForEvent(ReceiveFromMinecraftClient.HitResultContinuous, onPickHitResultChanged);

        system.listenForEvent(ChessEvents.GameStarting, onGameStarting);
    }

    system.update = function () {
        if (!!gameBoard && !!gameBoard.location) {
            playerLocation = {
                x: 7 + 32 * gameBoard.location.x,
                y: 9 + 1.7,
                z: (playerNumber == 1 ? -2 : 18) + 32 * gameBoard.location.z,
                rotation:  ((playerNumber == 1 ? 0 : 180) * Math.PI / 180.0)
            }
        }
        //playerLocation = playerNumber == 1 ? {x: 7, y: 4, z: -2, rotation: 0} : {x: 7, y: 4, z: 18, rotation: 180}
    }

    function onPickHitResultChanged(eventData: IPickHitResultContinuousEvent) {
        pickHitLocation = <{X: number, Y: number, Z: number}><any>eventData.position;
        if (!!pickHitLocation) {
            const mouseData: NotifyMouseCursor = {
                gameId: 0, x: pickHitLocation.X, y: pickHitLocation.Y, z: pickHitLocation.Z
            };
            system.broadcastEvent(ChessEvents.NotifyMouseCursor, mouseData);
        }
    }

    function onSetPlayerNumber(eventData: SetPlayerNumberData) {
        if (eventData.player.id !== thisClient.id) return;
        pickHitLocation = null;
        playerNumber = eventData.number;
    }

    function onClientEnteredWorld(eventData: IEntityObject) {
        loadUI(UI.Lobby);
        thisClient = eventData;
    }

    function onGameStarting(game: GameBoard) {
        if (!game.players.some(p => p.id === thisClient.id)) return;
        gameBoard = game;
        loadUI(UI.NewGame);
    }

    function onUIMessage(event: string) {
        const eventData = <UIEventData>JSON.parse(event);
        switch (eventData.name) {
            case ChessUIEvents.JoinGame:
                system.broadcastEvent(ChessEvents.JoinNewGame, thisClient);
                break;
            case ChessUIEvents.CloseUI:
                unloadUI();
                break;
            case ChessUIEvents.MouseMoved:
                //calculateHitPoint(eventData.data);
        }
    }

    function loadUI(ui: UI) {
        unloadUI();
        system.broadcastEvent(SendToMinecraftClient.LoadUI, ui)
    }

    function unloadUI(ui?: UI) {
        if (ui === undefined) {
            unloadUI(UI.Lobby);
            unloadUI(UI.NewGame);
        }
        system.broadcastEvent(SendToMinecraftClient.UnloadUI, ui)
    }

    enum UI {
        Lobby = "chess_start.html",
        NewGame = "chess_new_game.html"
    }

    function calculateHitPoint(mouseEvent: MouseMoveUIEventData) {
        const wtf = new WTF();
        const pickingRay = new PickingRay();
        const lookAt = new Vector3f(pickHitLocation.X, pickHitLocation.Y, pickHitLocation.Z);
        const playerPosition = new Vector3f(playerLocation.x, playerLocation.y, playerLocation.z);
        wtf.setupViewPort(mouseEvent.screenWidth, mouseEvent.screenHeight);
        wtf.setupViewProjection(playerPosition, lookAt);
        wtf.picking(mouseEvent.x, mouseEvent.y, pickingRay);

        const result: number[] = [0, 0, 0];


        const planeNormal: Vector3f = new Vector3f(0, 1, 0);
        const planeOrigin: Vector3f = new Vector3f(0, 6, 0);
        const head = new Vector3f().set(playerPosition);
        const dot = planeNormal.dot(pickingRay.getDirection());
        if (Math.abs(dot) > 0.000001) {
            const w = new Vector3f().set(head).sub(planeOrigin);
            const factor = -planeNormal.dot(w) / dot;

            const planeResult = new Vector3f().set(head).add(new Vector3f().set(pickingRay.getDirection()).scale(factor))
            result[0] = planeResult.x;
            result[1] = planeResult.y;
            result[2] = planeResult.z;
        }

        //pickingRay.intersectionWithXzPlane(result);
        const mouseData: NotifyMouseCursor = {
            gameId: 0, x: result[0], y: result[1], z: result[2]
        };
        system.broadcastEvent(SendToMinecraftClient.DisplayChat, JSON.stringify(result));
        system.broadcastEvent(ChessEvents.NotifyMouseCursor, mouseData);
        system.broadcastEvent(SendToMinecraftClient.SendUIEvent, <IUIEventParameters>{
            eventName: "chess:raytrace",
            data: JSON.stringify(mouseData)
        });
    }

    class WTF {
        private view = new Vector3f();
        private screenHorizontally = new Vector3f();
        private screenVertically = new Vector3f();
        private viewportWidth: number;
        private viewportHeight: number;
        private position: Vector3f;

        setupViewPort(width: number, height: number) {
            this.viewportWidth = width;
            this.viewportHeight = height;
        }

        private getViewportAspectRatio() {
            return this.viewportWidth / this.viewportHeight;
        }

        setupViewProjection(position: Vector3f, lookAt: Vector3f) {
            this.position = position;
            const up = new Vector3f(0, 1, 0);
            const viewAngle = 70;
            const nearClippingPlaneDistance = 12.5;
            
            // look direction
            this.view.subAndAssign(lookAt, position).normalize();           

            this.view.z = -this.view.z;

            // screenX
            this.screenHorizontally.crossAndAssign(this.view, up).normalize();
                    
            // screenY
            this.screenVertically.crossAndAssign(this.screenHorizontally, this.view).normalize();

            const radians = (viewAngle * Math.PI / 180.0);
            const halfHeight = (Math.tan(radians / 2) * nearClippingPlaneDistance);
            const halfScaledAspectRatio = halfHeight * this.getViewportAspectRatio();
            
            this.screenVertically.scale(halfHeight);
            this.screenHorizontally.scale(halfScaledAspectRatio);
        }

        picking(screenX: number, screenY: number, pickingRay: PickingRay) {
            const getClickPosInWorld = pickingRay.getClickPosInWorld()
            const direction = pickingRay.getDirection();
            getClickPosInWorld.set(this.position);
            getClickPosInWorld.add(this.view);
            
            screenX -= this.viewportWidth / 2;
            screenY -= this.viewportHeight / 2;
            
            // normalize to 1
            screenX /= (this.viewportWidth / 2);
            screenY /= (this.viewportHeight / 2);
            
            getClickPosInWorld.x += this.screenHorizontally.x*screenX + this.screenVertically.x*screenY;
            getClickPosInWorld.y += this.screenHorizontally.y*screenX + this.screenVertically.y*screenY;
            getClickPosInWorld.z += this.screenHorizontally.z*screenX + this.screenVertically.z*screenY;
            
            direction.set(getClickPosInWorld);
            direction.sub(this.position);
        }
    }

    class PickingRay 
    {
        private clickPosInWorld: Vector3f = new Vector3f();
        private direction: Vector3f = new Vector3f();
        
        /**
         * Computes the intersection of this ray with the X-Y Plane (where Z = 0)
         * and writes it back to the provided vector.
         */
        public intersectionWithXzPlane(worldPos: number[]): void
        {
            const s = -this.clickPosInWorld.y / this.direction.y;
            worldPos[0] = this.clickPosInWorld.x+this.direction.x*s;
            worldPos[1] = 0;
            worldPos[2] = this.clickPosInWorld.z+this.direction.z*s;
        }
        
        public getClickPosInWorld() {
            return this.clickPosInWorld;
        }
        public getDirection() {
            return this.direction;
        }	
    }
    
    class Vector3f {
        constructor(public x: number = 0, 
                    public y: number = 0, 
                    public z: number = 0) {
        }

        public add(a: Vector3f) {
            this.x += a.x;
            this.y += a.y;
            this.z += a.z;
            
            return this;
        }

        public set(v: Vector3f)	{
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            
            return this;
        }

        public subAndAssign(a: Vector3f, b: Vector3f) {
            this.x = a.x - b.x;
            this.y = a.y - b.y;
            this.z = a.z - b.z;
            
            return this;
        }

        public sub(a: Vector3f) {
            this.x -= a.x;
            this.y -= a.y;
            this.z -= a.z;
            
            return this;
        }
        
        public dot(a: Vector3f) {
            return this.x * a.x + this.y * a.y + this.z * a.z;
        }

        /**
         * Returns the length of the vector, also called L2-Norm or Euclidean Norm.
         */
        public l2Norm() {
            return Math.sqrt(
                this.x * this.x + 
                this.y * this.y +
                this.z * this.z
            );
        }
        
        public crossAndAssign(a: Vector3f, b: Vector3f) {
            const tempX = a.y * b.z - a.z * b.y;
            const tempY = a.z * b.x - a.x * b.z;
            const tempZ = a.x * b.y - a.y * b.x;
            
            this.x = tempX;
            this.y = tempY;
            this.z = tempZ;
            
            return this;
        }

        public scale(scalar: number) {
            this.x *= scalar;
            this.y *= scalar;
            this.z *= scalar;
            
            return this;
        }
        
        public normalize() {
            const length = this.l2Norm();
            this.x /= length;
            this.y /= length;
            this.z /= length;
            
            return this;
        }
    }
}