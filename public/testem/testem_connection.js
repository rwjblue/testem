/* globals document, parent, window, io, navigator, decycle */
/* globals TestemConnection */

var socket;
var connectStatus = 'disconnected';

function syncConnectStatus() {
  var elm = document.getElementById('__testem_ui__');
  if (elm) {
    elm.className = connectStatus;
  }
}

function serializeMessage(message) {
  // stringify for browsers (IE <= 10) that do not support sending an
  // object via postMessage
  // No need to decycle because the messages sent from iframe to parent
  // are known and will not include arbitrary objects.
  return JSON.stringify(message);
}

function deserializeMessage(message) {
  return JSON.parse(message);
}

function sendMessageToParent(type, data) {
  var message = {type: type};
  if (data) {
    message.data = data;
  }
  message = serializeMessage(message);
  parent.postMessage(message, '*');
}

var addListener = window.addEventListener ?
  function(obj, evt, cb) { obj.addEventListener(evt, cb, false); } :
  function(obj, evt, cb) { obj.attachEvent('on' + evt, cb); };

addListener(window, 'message', handleMessage);

var messageListeners = {};
function handleMessage(event) {
  if (event.source !== window.parent) {
    // Ignore messages not from the parent
    return;
  }
  var message = deserializeMessage(event.data);
  var type    = message.type;
  var data    = message.data;

  if (messageListeners[type]) {
    var callback   = messageListeners[type].callback;
    var listenOnce = messageListeners[type].listenOnce;

    callback(data);

    if (listenOnce) {
      messageListeners[type] = null;
    }
  }
}

function addMessageListener(type, callback, listenOnce) {
  messageListeners[type] = {callback: callback, listenOnce: listenOnce};
}

function addMessageListenerOnce(type, callback) {
  var listenOnce = true;
  addMessageListener(type, callback, listenOnce);
}

function startTests() {
  socket.disconnect();
  sendMessageToParent('reload');
}

function initUI() {
  var markup = 'TEST\u0027EM \u0027SCRIPTS!';
  var elm = document.createElement('div');
  elm.id = '__testem_ui__';
  elm.className = connectStatus;
  elm.innerHTML = markup;
  document.body.appendChild(elm);
}

function getBrowserName(userAgent) {
  var regexs = [
    /MS(?:(IE) (1?[0-9]\.[0-9]))/,
    [/Trident\/.* rv:(1?[0-9]\.[0-9])/, function(m) {
      return ['IE', m[1]].join(' ');
    }],
    [/(OPR)\/([0-9]+\.[0-9]+)/, function(m) {
      return ['Opera', m[2]].join(' ');
    }],
    /(Opera).*Version\/([0-9]+\.[0-9]+)/,
    /(Edge)\/([0-9]+\.[0-9]+)/,
    /(Chrome)\/([0-9]+\.[0-9]+)/,
    /(Firefox)\/([0-9a-z]+\.[0-9a-z]+)/,
    /(PhantomJS)\/([0-9]+\.[0-9]+)/,
    [/(Android).*Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m) {
      return [m[1], m[3], m[2]].join(' ');
    }],
    [/(iPhone).*Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m) {
      return [m[1], m[3], m[2]].join(' ');
    }],
    [/(iPad).*Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m) {
      return [m[1], m[3], m[2]].join(' ');
    }],
    [/Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m) {
      return [m[2], m[1]].join(' ');
    }]
  ];
  var defaultPick = function(m) {
    return m.slice(1).join(' ');
  };

  for (var i = 0; i < regexs.length; i++) {
    var regex = regexs[i];
    var pick = defaultPick;
    if (regex instanceof Array) {
      pick = regex[1];
      regex = regex[0];
    }
    var match = userAgent.match(regex);
    if (match) {
      return pick(match);
    }
  }
  return userAgent;
}

function getId(callback) {
  addMessageListenerOnce('get-id', function(id) {
    callback(id);
  });
  sendMessageToParent('get-id');
}

function init() {
  getId(function(id) {
    if (id === '-1') { // No connection required
      sendMessageToParent('no-connection-required');
    } else {
      initSocket(id);

      addListener(window, 'load', initUI);
      addMessageListener('emit-message', function(item) {
        TestemConnection.emit.apply(null, item);
      });

      sendMessageToParent('iframe-ready');
    }
  });
}

function initSocket(id) {
  socket = io.connect({ reconnectionDelayMax: 1000, randomizationFactor: 0 });
  socket.emit('browser-login', getBrowserName(navigator.userAgent), id);
  socket.on('connect', function() {
    connectStatus = 'connected';
    syncConnectStatus();
  });
  socket.on('disconnect', function() {
    connectStatus = 'disconnected';
    syncConnectStatus();
  });
  socket.on('start-tests', startTests);
}

window.TestemConnection = {
  emit: function() {
    var args = Array.prototype.slice.apply(arguments);

    // Workaround IE 8 max instructions
    setTimeout(function() {
      var decycled = decycle(args);
      setTimeout(function() {
        socket.emit.apply(socket, decycled);
      }, 0);
    }, 0);
  }
};

init();
