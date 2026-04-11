(function() {
  var WEBHOOK_URL = FP.WEBHOOK_URL;
  var listEl = document.getElementById('studentList');

  async function loadStudents() {
    try {
      var data = await FP.api.get(WEBHOOK_URL + '?action=get_students');
      if (!data || !data.students || data.students.length === 0) {
        listEl.innerHTML = '<div class="empty-msg">No students registered yet.<br>Students appear here after they visit the hub for the first time.</div>';
        return;
      }
      listEl.innerHTML = '';
      data.students.forEach(function(s) {
        var card = document.createElement('a');
        card.className = 'student-card';
        card.href = 'src/examiner-panel.html?student=' + encodeURIComponent(s.name);
        card.innerHTML =
          '<div class="student-name">' + escHtml(s.name) + '</div>' +
          '<span class="student-arrow">&rarr;</span>';
        listEl.appendChild(card);
      });
    } catch(e) {
      listEl.innerHTML = '<div class="empty-msg">Could not load students.<br>' + escHtml(e.message) + '</div>';
    }
  }

  loadStudents();
})();
