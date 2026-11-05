// ==UserScript==
// @name         Filtr pokoju – lista mieszkańców
// @namespace    https://apedps01.bzmw.gov.pl/
// @version      1.2
// @updateURL    https://raw.githubusercontent.com/hardcook69/Syrena-Tempermokey/main/FiltrPokoju.user.js
// @downloadURL  https://raw.githubusercontent.com/hardcook69/Syrena-Tempermokey/main/FiltrPokoju.user.js
// @description  Dodaje pole "Pokój:" do siatek z listą mieszkańców (Mieszkańcy proponowani / biorący udział) i filtruje wiersze po numerze pokoju. Przycisk "Sortuj" liczbowo porządkuje wiersze po numerze pokoju (rosnąco/malejąco). Dokłada też "Zaznacz widoczne" oraz "Odznacz widoczne", żeby zaznaczanie obejmowało tylko przefiltrowane wiersze. Przy wejściu podnosi rozmiar strony, żeby filtr i sortowanie obejmowały wszystkich mieszkańców, a nie tylko bieżącą stronę.
// @match        *://apedps01.bzmw.gov.pl/*
// @match        *://ttapedps01.bzmw.gov.pl/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // rozpoznajemy siatkę z mieszkańcami po nagłówkach kolumn (tolerancyjnie – "zawiera")
  function isRoomHeader(t) { return t.indexOf('numer pokoju') !== -1 || t === 'pokój' || t === 'pokoj'; }
  function isNameHeader(t) { return t.indexOf('mieszkan') !== -1; }

  // ---------------------------------------------------------------- style
  var css = ''
    + '.rf-bar{display:inline-flex;align-items:center;gap:6px;margin:0 8px;font-size:12px;}'
    + '.rf-bar label{font-weight:600;color:#333;}'
    + '.rf-bar input.rf-input{width:90px;padding:2px 6px;border:1px solid #f0792a;border-radius:4px;font-size:12px;}'
    + '.rf-bar button.rf-btn{padding:2px 8px;border:1px solid #c9c9c9;border-radius:4px;background:#f7f7f7;cursor:pointer;font-size:12px;}'
    + '.rf-bar button.rf-btn:hover{background:#eee;}'
    + '.rf-bar .rf-count{color:#777;min-width:46px;}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ---------------------------------------------------------------- helpers
  function headerCells(grid) {
    return Array.prototype.slice.call(
      grid.querySelectorAll('.dx-datagrid-headers td[role="columnheader"]'));
  }

  // Zwraca aria-colindex kolumny "Numer pokoju" albo null, jeśli to nie ta siatka.
  function roomColIndex(grid) {
    var cells = headerCells(grid);
    if (!cells.length) return null;
    var hasName = false, roomIdx = null;
    cells.forEach(function (td) {
      var t = (td.textContent || '').trim().toLowerCase();
      if (isNameHeader(t)) hasName = true;
      if (isRoomHeader(t)) roomIdx = td.getAttribute('aria-colindex');
    });
    return (hasName && roomIdx) ? roomIdx : null;
  }

  function dataRows(grid) {
    return Array.prototype.slice.call(
      grid.querySelectorAll('.dx-datagrid-rowsview tr.dx-data-row'));
  }

  function roomOfRow(row, colIdx) {
    var cell = row.querySelector('td[aria-colindex="' + colIdx + '"]');
    return (cell ? cell.textContent : '').trim().toLowerCase();
  }

  // Zamienia numer pokoju na liczbę do sortowania (np. "215" -> 215, "1A" -> 1); null gdy brak cyfr.
  function roomNumber(txt) {
    var m = (txt || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  // ---------------------------------------------------------------- filtr
  function applyFilter(grid) {
    var colIdx = grid.__rfCol;
    var q = (grid.__rfQuery || '').trim().toLowerCase();
    var rows = dataRows(grid), shown = 0;
    rows.forEach(function (r) {
      var ok = !q || roomOfRow(r, colIdx).indexOf(q) !== -1;
      r.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    if (grid.__rfCount) grid.__rfCount.textContent = q ? (shown + '/' + rows.length) : (rows.length + '');
  }

  function selectVisible(grid, check) {
    dataRows(grid).forEach(function (r) {
      if (r.style.display === 'none') return;
      var cb = r.querySelector('td.dx-command-select .dx-checkbox');
      if (!cb) return;
      var checked = cb.getAttribute('aria-checked') === 'true';
      if (check && !checked) cb.click();
      if (!check && checked) cb.click();
    });
  }

  // Liczbowe sortowanie wierszy po numerze pokoju (porządkuje kolejność w tabeli).
  function sortRows(grid) {
    var dir = grid.__rfSort;                 // 'asc' | 'desc' | null
    if (!dir) return;
    var rows = dataRows(grid);
    if (!rows.length) return;
    var tbody = rows[0].parentNode;
    if (!tbody) return;
    var sign = dir === 'desc' ? -1 : 1;
    rows.sort(function (a, b) {
      var ra = roomNumber(roomOfRow(a, grid.__rfCol));
      var rb = roomNumber(roomOfRow(b, grid.__rfCol));
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;             // bez numeru -> na koniec
      if (rb === null) return -1;
      return (ra - rb) * sign;
    });
    var free = tbody.querySelector('tr.dx-freespace-row');
    rows.forEach(function (r) { tbody.appendChild(r); });
    if (free) tbody.appendChild(free);       // pusty wiersz zawsze na dół
  }

  // Nałóż sortowanie + filtr, nie wywołując własnego obserwatora (bez pętli).
  function applyAll(grid) {
    var obs = grid.__rfObs;
    if (obs) obs.disconnect();
    sortRows(grid);
    applyFilter(grid);
    if (obs && grid.__rfRowsView) {
      setTimeout(function () {
        obs.observe(grid.__rfRowsView, { childList: true, subtree: true });
      }, 0);
    }
  }

  // Najlepszym staraniem: ustaw najwiekszy rozmiar strony, żeby wszyscy
  // mieszkańcy byli na jednej stronie (filtr widzi wtedy komplet).
  function raisePageSize(grid) {
    try {
      var box = grid.querySelector('.dx-datagrid-pager .dx-page-sizes .dx-selectbox');
      if (!box) return;
      var input = box.querySelector('input.dx-texteditor-input');
      if (!input) return;
      // otwórz listę rozmiarów
      input.dispatchEvent(new MouseEvent('dxpointerdown', { bubbles: true }));
      input.click();
      setTimeout(function () {
        var items = document.querySelectorAll('.dx-overlay-wrapper .dx-list-item');
        if (!items.length) { document.body.click(); return; }
        var best = null, bestVal = -1;
        items.forEach(function (it) {
          var t = (it.textContent || '').trim().toLowerCase();
          var v = /wszys|all/.test(t) ? 1e9 : parseInt(t, 10);
          if (!isNaN(v) && v > bestVal) { bestVal = v; best = it; }
        });
        if (best) best.click(); else document.body.click();
      }, 120);
    } catch (e) { /* cicho */ }
  }

  // ---------------------------------------------------------------- wstrzyknięcie
  function injectInto(grid) {
    if (grid.__rfInit) return;
    var colIdx = roomColIndex(grid);
    if (!colIdx) return;                       // to nie jest siatka z mieszkańcami
    grid.__rfInit = true;
    grid.__rfCol = colIdx;
    grid.__rfQuery = '';
    grid.__rfSort = null;

    var bar = document.createElement('div');
    bar.className = 'rf-bar';
    bar.innerHTML =
      '<label>Pokój:</label>' +
      '<input type="text" class="rf-input" placeholder="np. 215" inputmode="numeric">' +
      '<button type="button" class="rf-btn rf-clear" title="Wyczyść filtr">✕</button>' +
      '<button type="button" class="rf-btn rf-sort" title="Sortuj po numerze pokoju">Sortuj: —</button>' +
      '<button type="button" class="rf-btn rf-sel">Zaznacz widoczne</button>' +
      '<button type="button" class="rf-btn rf-unsel">Odznacz widoczne</button>' +
      '<span class="rf-count"></span>';

    var input = bar.querySelector('.rf-input');
    grid.__rfCount = bar.querySelector('.rf-count');
    var sortBtn = bar.querySelector('.rf-sort');

    var deb;
    input.addEventListener('input', function () {
      grid.__rfQuery = input.value;
      clearTimeout(deb);
      deb = setTimeout(function () { applyFilter(grid); }, 120);
    });
    bar.querySelector('.rf-clear').addEventListener('click', function () {
      input.value = ''; grid.__rfQuery = ''; applyFilter(grid); input.focus();
    });
    sortBtn.addEventListener('click', function () {
      grid.__rfSort = grid.__rfSort === null ? 'asc' : (grid.__rfSort === 'asc' ? 'desc' : null);
      sortBtn.textContent = 'Sortuj: ' + (grid.__rfSort === 'asc' ? '↑ rosnąco'
                          : grid.__rfSort === 'desc' ? '↓ malejąco' : '—');
      applyAll(grid);
    });
    bar.querySelector('.rf-sel').addEventListener('click', function () { selectVisible(grid, true); });
    bar.querySelector('.rf-unsel').addEventListener('click', function () { selectVisible(grid, false); });

    // miejsce na pasek: toolbar nagłówka siatki (obok "Zaznacz wszystkich")
    var toolbar = grid.querySelector('.dx-datagrid-header-panel .dx-toolbar-before')
             || grid.querySelector('.dx-datagrid-header-panel .dx-toolbar-items-container');
    var panel = grid.querySelector('.dx-datagrid-header-panel');
    var headers = grid.querySelector('.dx-datagrid-headers');
    if (toolbar) {
      toolbar.appendChild(bar);
    } else if (panel) {
      bar.style.display = 'flex'; bar.style.padding = '4px 6px';
      panel.insertBefore(bar, panel.firstChild);
    } else if (headers && headers.parentNode) {
      bar.style.display = 'flex'; bar.style.padding = '4px 6px';
      headers.parentNode.insertBefore(bar, headers);
    } else {
      grid.insertBefore(bar, grid.firstChild);
    }

    // ponowne nałożenie sortowania + filtra po przerysowaniu wierszy
    // (stronicowanie, odświeżenie, przenoszenie między listami)
    var rowsView = grid.querySelector('.dx-datagrid-rowsview');
    if (rowsView) {
      grid.__rfRowsView = rowsView;
      var rdeb;
      grid.__rfObs = new MutationObserver(function () {
        clearTimeout(rdeb);
        rdeb = setTimeout(function () { applyAll(grid); }, 60);
      });
      grid.__rfObs.observe(rowsView, { childList: true, subtree: true });
    }

    raisePageSize(grid);
    applyAll(grid);
  }

  function scan() {
    var grids = document.querySelectorAll('.dx-datagrid');
    Array.prototype.forEach.call(grids, injectInto);
  }

  // Dowolna zmiana DOM -> odpięte, zdebouncowane przeskanowanie całej strony.
  // Dzięki temu łapiemy siatkę także wtedy, gdy nagłówki dorysują się z opóźnieniem.
  var sdeb;
  function scheduleScan() { clearTimeout(sdeb); sdeb = setTimeout(scan, 150); }

  var mo = new MutationObserver(scheduleScan);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Dodatkowa siatka bezpieczeństwa: skanuj co 1,5 s przez pierwsze pół minuty
  // (gdyby obserwator czegoś nie złapał), a potem już tylko na zmiany DOM.
  var ticks = 0;
  var iv = setInterval(function () { scan(); if (++ticks > 20) clearInterval(iv); }, 1500);

  scan();
})();
