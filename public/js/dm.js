'use strict';

(function () {
  var box = document.querySelector('.chat-box');
  var otherId = parseInt(box.getAttribute('data-other-id'), 10);
  var socket = io();
  var list = document.getElementById('messages');
  var form = document.getElementById('dm-form');
  var input = document.getElementById('dm-input');

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

  socket.on('connect', function () {
    socket.emit('dm:join', { userId: otherId });
  });

  socket.on('dm:history', function (data) {
    list.innerHTML = '';
    data.messages.forEach(addMessage);
  });

  socket.on('dm:message', addMessage);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var content = input.value.trim();
    if (!content) return;
    socket.emit('dm:message', { userId: otherId, content: content });
    input.value = '';
  });

  socket.on('connect_error', function () {
    var li = document.createElement('li');
    li.className = 'msg-error';
    li.textContent = '채팅 연결에 실패했습니다. 로그인 상태를 확인하세요.';
    list.appendChild(li);
  });
})();
