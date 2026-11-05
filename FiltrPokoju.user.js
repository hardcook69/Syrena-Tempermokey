// ==UserScript==
// @name         Filtr pokoju – lista mieszkańców
// @namespace    https://apedps01.bzmw.gov.pl/
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/hardcook69/Syrena-Tempermokey/main/FiltrPokoju.user.js
// @downloadURL  https://raw.githubusercontent.com/hardcook69/Syrena-Tempermokey/main/FiltrPokoju.user.js
// @description  Dodaje pole "Pokój:" do siatek z listą mieszkańców (Mieszkańcy proponowani / biorący udział) i filtruje wiersze po numerze pokoju. Dokłada też "Zaznacz widoczne" oraz "Odznacz widoczne", żeby zaznaczanie obejmowało tylko przefiltrowane wiersze. Przy wejściu podnosi rozmiar strony, żeby filtr obejmował wszystkich mieszkańców, a nie tylko bieżącą stronę.
// @match        *://apedps01.bzmw.gov.pl/*
// @match        *://ttapedps01.bzmw.gov.pl/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  var ROOM_HEADER = 'numer pokoju';   // po tym rozpoznajemy siatkę z mieszkańcami
  var NAME_HEADER = 'mieszkaniec';

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
      if (t === NAME_HEADER) hasName = true;
      if (t === ROOM_HEADER) roomIdx = td.getAttribute('aria-colindex');
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

    var bar = document.createElement('div');
    bar.className = 'rf-bar';
    bar.innerHTML =
      '<label>Pokój:</label>' +
      '<input type="text" class="rf-input" placeholder="np. 215" inputmode="numeric">' +
      '<button type="button" class="rf-btn rf-clear" title="Wyczyść filtr">✕</button>' +
      '<button type="button" class="rf-btn rf-sel">Zaznacz widoczne</button>' +
      '<button type="button" class="rf-btn rf-unsel">Odznacz widoczne</button>' +
      '<span class="rf-count"></span>';

    var input = bar.querySelector('.rf-input');
    grid.__rfCount = bar.querySelector('.rf-count');

    var deb;
    input.addEventListener('input', function () {
      grid.__rfQuery = input.value;
      clearTimeout(deb);
      deb = setTimeout(function () { applyFilter(grid); }, 120);
    });
    bar.querySelector('.rf-clear').addEventListener('click', function () {
      input.value = ''; grid.__rfQuery = ''; applyFilter(grid); input.focus();
    });
    bar.querySelector('.rf-sel').addEventListener('click', function () { selectVisible(grid, true); });
    bar.querySelector('.rf-unsel').addEventListener('click', function () { selectVisible(grid, false); });

    // miejsce na pasek: toolbar nagłówka siatki (obok "Zaznacz wszystkich")
    var place = grid.querySelector('.dx-datagrid-header-panel .dx-toolbar-before')
             || grid.querySelector('.dx-datagrid-header-panel .dx-toolbar-items-container')
             || grid.querySelector('.dx-datagrid-header-panel');
    if (place) {
      place.appendChild(bar);
    } else {
      grid.insertBefore(bar, grid.firstChild);
    }

    // ponowne nałożenie filtra po przerysowaniu wierszy (stronicowanie, odświeżenie, przenoszenie)
    var rowsView = grid.querySelector('.dx-datagrid-rowsview');
    if (rowsView) {
      var rdeb;
      var obs = new MutationObserver(function () {
        clearTimeout(rdeb);
        rdeb = setTimeout(function () { applyFilter(grid); }, 50);
      });
      obs.observe(rowsView, { childList: true, subtree: true });
    }

    raisePageSize(grid);
    applyFilter(grid);
  }

  function scan(root) {
    var grids = (root.querySelectorAll ? root.querySelectorAll('.dx-datagrid') : []);
    Array.prototype.forEach.call(grids, injectInto);
    if (root.matches && root.matches('.dx-datagrid')) injectInto(root);
  }

  // obserwuj pojawiające się okna/siatki
  var mo = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (n.nodeType === 1) scan(n);
      });
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  scan(document);
})();
