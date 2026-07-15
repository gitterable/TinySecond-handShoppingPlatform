'use strict';

(function () {
  var socket = io();
  var list = document.getElementById('messages');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');

  // Render using textContent to prevent XSS (never innerHTML with user data).
  function addMessage(msg) {
    var li = document.createElement('li');
    var name = document.createElement('span');
    name.className = 'msg-user';
    name.textContent = msg.username + ': ';
    var body = document.createElement('span');
    body.className = 'msg-body';
    body.textContent = msg.content;
    li.appendChild(name);
    li.appendChild(body);
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }

  socket.on('global:history', function (messages) {
    list.innerHTML = '';
    messages.forEach(addMessage);
  });

  socket.on('global:message', addMessage);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var content = input.value.trim();
    if (!content) return;
    socket.emit('global:message', { content: content });
    input.value = '';
  });

  socket.on('connect_error', function () {
    var li = document.createElement('li');
    li.className = 'msg-error';
    li.textContent = '채팅 연결에 실패했습니다. 로그인 상태를 확인하세요.';
    list.appendChild(li);
  });
})();
