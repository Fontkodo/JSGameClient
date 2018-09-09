
function launch(){
    var userid = prompt("Player ID");
    if(!userid){
	return;
    }
    document.body.classList.add('dark-background');
    document.getElementById("main").style.display = 'none';
    blasteroids({
	userid: userid,
	wsUri: `ws://${document.location.hostname}:6080/blasteroids`,
	waitReady : false,
	canvas: document.getElementById("canvas") });
}

function blasteroids(config){ //{ userid:, wsUri:.., canvas: ... }

    "use strict";

    const wsUri			= config.wsUri; //"ws://10.0.0.169:6080/blasteroids";
    const canvas		= config.canvas;
    const userid		= config.userid; // "Fontkodo"
    const waitReady		= config.waitReady;

    var websocket		= null;
    var gameState		= null;
    var messageCount		= 0;
    var millisecondAdjustment	= 0;
    var messageText             = [ "Arrows or WASD for direction/thrust",
				    "SPACE to fire",
				    "M toggle muting" ].join(", ");
    var soundEnabled            = navigator.userAgent.match(/hrome|irefox/);
    var lastDisplayTime         = 0;
    var lastExplosionTime       = 0;
    var lastPhotonCount         = 10000000;

    if(!userid){
	throw("no user id supplied");
    }
    if(userid.match(/"/)){
	throw("bad user id supplied");
    }
    if(!(wsUri && wsUri.match(/^wss?:.*/))){
	throw("bad wsUri " + wsUri);
    }

    canvas.style.cursor = 'none';

    function sendUserAction(action){
	if(soundEnabled){
	    switch(action){
	    case 'forward':
	    case 'backward':
		playSound('thrust.mp3');
		break;
	    case 'fire':
		{
		    const player = gameState.SpaceObjects.find(so => so.userid == userid);
		    if(player){
			if(player.photonCount){
			    playSound('photon.mp3');
			} else {
			    playSound('out-of-ammo.mp3');
			}
		    }
		}
		break;
	    }
	}
	doSend(`{ "userid" : "${userid}", "action" : "${action}"}`);
    }

    function init()
    {
	websocket		= new WebSocket(wsUri);
	websocket.onopen	= onOpen;
	websocket.onmessage	= onMessage;
	websocket.onerror	= onError;
    }

    function onOpen(evt)
    {
	sendUserAction("connect");
	displayTimeoutCallback();
    }

    function setMillisecondAdjustment(remoteMillis){
	var diff = (new Date()).getTime() - remoteMillis;
	if(millisecondAdjustment){
	    millisecondAdjustment = Math.min(diff,millisecondAdjustment);
	} else {
	    millisecondAdjustment = diff;
	}
    }

    var fetchImg = function(){
	var cache = {};
	return function(imgName){
	    var img = cache[imgName];
	    if(!img){
		img = new Image();
		img.src = imgName;
		cache[imgName] = img;
	    }
	    return img;
	};
    }();

    var playSound = function(){
	var cache = {};
	return function(name,volume){
	    if(!soundEnabled){
		return;
	    }
	    if(!volume || volume > 1){
		volume = 1;
	    }
	    name = name.replace(/.wav$/,'.mp3');
	    if (name.indexOf('/') < 0){
		name = `http://blasteroids.net/assets/sounds/${name}`;
	    }
	    var sound = cache[name];
	    if(!sound){
		sound = new Audio(name);
		cache[name] = sound;
	    }
	    setTimeout(function(){
		sound.currentTime = 0;
		sound.volume = volume;
		sound.play();
	    },1);
	};
    }();

    function displayTimeoutCallback(){
	display();
	//setTimeout(displayTimeoutCallback,35);
	requestAnimationFrame(displayTimeoutCallback);
    }

    function display(){

	var currentMillis = (new Date()).getTime();
	var ctx = canvas.getContext("2d");

	if(!gameState || !gameState.SpaceObjects){
	    return;
	}

	lastDisplayTime = currentMillis;

	ctx.fillStyle = "black";
	ctx.fillRect(0,0,1400,800);


	if(gameState.SpaceObjects.find(so => (so.imgURL && so.imgURL.match(/xplosion1/)))){
	    if(currentMillis - lastExplosionTime > 200){
		playSound('Torpedo+Explosion.mp3',0.5);
		lastExplosionTime = currentMillis;
	    }
	}
	
        gameState.SpaceObjects.forEach( so => {
            const loc = so.loc;
            const vel = so.vel;
            const elapsed = currentMillis - so.timestamp - millisecondAdjustment;
            const x = loc.x + (elapsed * vel.x);
            const y = loc.y + (elapsed * vel.y);
            const radians = -((elapsed * so.rotvel) + so.currentRotation);
            const img = fetchImg(so.imgURL);
            const scale = so.scale;
            ctx.save();
            ctx.translate(x,y);
            ctx.rotate(radians);
            ctx.scale(scale,scale);
            if(so.userid == userid){
                ctx.strokeStyle = "yellow";
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.arc(0,0,5+ img.height/2,0,2*Math.PI);
                ctx.stroke();
            }
            ctx.drawImage(img,-img.width/2, -img.height/2);
            ctx.restore();
        });

        var player = gameState.SpaceObjects.find(so => so.userid == userid);

        var msg = (gameState.SpaceObjects.filter(so => so.score)
                   .map(so => `${so.userid}:${so.score}/${so.highScore}`)
                   .join("   "));

        ctx.fillStyle = "cyan";
        ctx.font = "14px Arial";
        ctx.fillText(msg, 10, 780);

	if(player){
	    const stats = [ { label: 'Score', value : player.score },
			    { label: 'Photons', value: player.photonCount },
			    { label: 'Fuel',  value: player.fuel.toFixed(1) },
			    { label: 'Shield Level', value: player.shieldLevel },
			    { label: 'High Score', value: player.highScore }];

	    ctx.font = "14px Arial";
            stats.forEach((stat,i) => {
		const text = stats[i].label + "";
		const measure = ctx.measureText(text);
		const x = 100 * (i+5);
		ctx.fillText(text, x - measure.width/2, 15);
	    });
	    ctx.font = "20px Arial";
            stats.forEach((stat,i) => {
		const text = parseInt(stats[i].value) + "";
		const measure = ctx.measureText(text);
		const x = 100 * (i+5);
		ctx.fillText(text, x - measure.width/2, 35);
	    });

	    if(player.photonCount > lastPhotonCount){
		playSound('success.mp3');
	    }
	    lastPhotonCount = player.photonCount;
	} else {
	    messageText = "Player Deceased";
            ctx.font = "42px Arial";
            ctx.fillStyle = "yellow";
            const width = ctx.measureText(msg).width;
            ctx.fillText(msg, 700 - (width/2), 380);
	    setTimeout(function(){ document.location=document.location; },3000);
	}

	if(messageText) {
	    ctx.fillStyle = "yellow";
	    ctx.font = "24px Arial";
	    ctx.fillText(messageText, 700-ctx.measureText(messageText).width/2, 150);
	}

    }

    var netStringCollector = "";

    function onMessage(evt)
    {
	if (!evt.data){
	    return;
	}

	netStringCollector = netStringCollector + evt.data;

	while (netStringCollector.length > 0){

	    var size = parseInt(netStringCollector);
	    var requiredSize = (size + "").length + size + (":,".length);
	    if (requiredSize > netStringCollector.length){
		break;
	    }

	    // Perhaps more than the required amount arrived in multiple netstrings.
	    // Evaluate the first netstring and keep the remainder in netStringCollector.
	    var currentNetString = netStringCollector.substr(0,requiredSize);
	    var content = currentNetString.replace(/^[0-9]+:(.*),/, '\$1');
	    netStringCollector = netStringCollector.substr(requiredSize);

	    messageCount++;
	    gameState = JSON.parse(content);

	    if(gameState.currentMillis){
		setMillisecondAdjustment(gameState.currentMillis);
	    }

	}
    }

    function onError(evt)
    {
	alert("WEBSOCKET ERROR " + (evt.data || ""));
    }

    function netstring(txt){
	return txt.length + ":" + txt + ",";
    }

    function doSend(message)
    {
	if(websocket){
	    websocket.send(netstring(message));
	} else {
	    console.log("no websocket");
	}
    }

    function setupScaling(){

	var w = Math.max(
	    document.body.scrollWidth,
	    document.documentElement.scrollWidth,
	    document.body.offsetWidth,
	    document.documentElement.offsetWidth,
	    document.documentElement.clientWidth);

	var h = Math.max(
	    document.body.scrollHeight,
	    document.documentElement.scrollHeight,
	    document.body.offsetHeight,
	    document.documentElement.offsetHeight,
	    document.documentElement.clientHeight);

	var scaling = Math.min((w-20) / 1400, (h-20) / 800);

	canvas.width = scaling * 1400;
	canvas.height = scaling * 800;

	var ctx = canvas.getContext("2d");
	ctx.scale(scaling, scaling);

    }

    if(waitReady){
	window.addEventListener("load", init, false);
	document.addEventListener('DOMContentLoaded',setupScaling);
    } else {
	init();
	setupScaling();
    }

    document.addEventListener("keydown", function(e){
	// checkout keycode.info
  	var commands = { 32	: "fire",	// spacebar 
			 39	: "right",	// right-arrow
			 68	: "right",	// D-key
			 37     : "left",	// left-arrow
			 65	: "left",	// A-key 
			 38	: "forward",	// up-arrow 
			 87	: "forward",	// W-key 
			 40	: "backward",	// down-arrow
			 83	: "backward",	// S-key
		       };

	var action = commands[e.keyCode];
	if (action) {
	    sendUserAction(action);
	    e.preventDefault();
	}
	messageText = '';
	if(e.keyCode == 77 /* M */){
	    soundEnabled = !soundEnabled;
	    messageText = soundEnabled ? "Sound Enabled" : "Sound Disabled";
	}

	// This assumes that the server will soon send new player information
	// but causes the UI to be immediate.  If this is removed, the game should
	// work exactly the same, but with small lag.
	if(action == "left" || action == "right"){
            const player = gameState.SpaceObjects.find(so => so.userid == userid);
	    const currentMillis = (new Date()).getTime();
	    if(player && (currentMillis - lastDisplayTime) > currentMillis){
		const degrees = (action == "left") ? 5 : -5;
		const radians = degrees * Math.PI / 180;
		player.currentRotation += radians;
		display();
	    }
	}
    });

}

