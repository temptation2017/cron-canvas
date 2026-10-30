/**
 * cron-canvas — pure JS cron explainer + next-run preview
 * Standard 5-field (min hour dom month dow) or optional 6-field with seconds.
 */

(function () {
  "use strict";

  var FIELD_META = [
    { key: "second", name: "秒", min: 0, max: 59, unit: "秒" },
    { key: "minute", name: "分", min: 0, max: 59, unit: "分" },
    { key: "hour", name: "时", min: 0, max: 23, unit: "时" },
    { key: "dom", name: "日", min: 1, max: 31, unit: "日" },
    { key: "month", name: "月", min: 1, max: 12, unit: "月" },
    { key: "dow", name: "周", min: 0, max: 7, unit: "周" }
  ];

  var DOW_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  var MONTH_NAMES = [
    "", "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月"
  ];

  function expandField(raw, meta, isDow) {
    var s = String(raw).trim();
    if (s === "") {
      throw new Error(meta.name + "字段为空");
    }
    if (!/^[\d\*\-\,\/]+$/.test(s)) {
      throw new Error(meta.name + "字段含非法字符：「" + s + "」");
    }

    var out = {};
    var parts = s.split(",");
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part === "") {
        throw new Error(meta.name + "字段有空列表项");
      }
      var step = 1;
      var rangePart = part;
      var slash = part.indexOf("/");
      if (slash !== -1) {
        rangePart = part.slice(0, slash);
        var stepStr = part.slice(slash + 1);
        if (!/^\d+$/.test(stepStr) || Number(stepStr) === 0) {
          throw new Error(meta.name + "字段步进无效：「" + part + "」");
        }
        step = Number(stepStr);
      }

      var start;
      var end;
      if (rangePart === "*") {
        start = meta.min;
        end = meta.max;
      } else if (rangePart.indexOf("-") !== -1) {
        var se = rangePart.split("-");
        if (se.length !== 2 || !/^\d+$/.test(se[0]) || !/^\d+$/.test(se[1])) {
          throw new Error(meta.name + "字段范围无效：「" + part + "」");
        }
        start = Number(se[0]);
        end = Number(se[1]);
        if (start > end) {
          throw new Error(meta.name + "字段范围起止颠倒：「" + part + "」");
        }
      } else {
        if (!/^\d+$/.test(rangePart)) {
          throw new Error(meta.name + "字段数值无效：「" + part + "」");
        }
        start = Number(rangePart);
        end = start;
      }

      if (start < meta.min || end > meta.max) {
        throw new Error(
          meta.name + "字段超出范围 " + meta.min + "–" + meta.max + "：「" + part + "」"
        );
      }

      for (var v = start; v <= end; v += step) {
        out[v] = true;
        if (isDow) {
          if (v === 0) out[7] = true;
          if (v === 7) out[0] = true;
        }
      }
    }
    return out;
  }

  function describeField(raw, meta, isDow) {
    var s = String(raw).trim();
    if (s === "*") return "每" + meta.unit;
    if (/^\*\/(\d+)$/.test(s)) {
      return "每隔 " + RegExp.$1 + " " + meta.unit;
    }

    var bits = [];
    var parts = s.split(",");
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var step = null;
      var rangePart = part;
      var slash = part.indexOf("/");
      if (slash !== -1) {
        rangePart = part.slice(0, slash);
        step = part.slice(slash + 1);
      }
      var text;
      if (rangePart === "*") {
        text = "每" + meta.unit;
      } else if (rangePart.indexOf("-") !== -1) {
        var se = rangePart.split("-");
        if (isDow) {
          text = DOW_NAMES[Number(se[0])] + "至" + DOW_NAMES[Number(se[1])];
        } else if (meta.key === "month") {
          text = MONTH_NAMES[Number(se[0])] + "至" + MONTH_NAMES[Number(se[1])];
        } else {
          text = se[0] + "–" + se[1] + meta.unit;
        }
      } else {
        if (isDow) {
          text = DOW_NAMES[Number(rangePart)];
        } else if (meta.key === "month") {
          text = MONTH_NAMES[Number(rangePart)];
        } else {
          text = rangePart + meta.unit;
        }
      }
      if (step) text += "（每 " + step + " 步）";
      bits.push(text);
    }
    return bits.join("、");
  }

  function parseCron(expr) {
    var trimmed = String(expr || "").trim().replace(/\s+/g, " ");
    if (!trimmed) {
      throw new Error("请输入 cron 表达式");
    }
    // reject aliases
    if (trimmed.charAt(0) === "@") {
      throw new Error("不支持 @" + trimmed.slice(1).split(/\s/)[0] + " 这类别名，请写成标准字段");
    }

    var tokens = trimmed.split(" ");
    var hasSeconds = false;
    var fields;
    if (tokens.length === 5) {
      fields = ["0"].concat(tokens); // implicit second = 0
      hasSeconds = false;
    } else if (tokens.length === 6) {
      fields = tokens;
      hasSeconds = true;
    } else {
      throw new Error(
        "需要 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周），当前 " +
          tokens.length +
          " 段"
      );
    }

    var expanded = {};
    var descriptions = [];
    var metas = hasSeconds ? FIELD_META : FIELD_META.slice(1);
    var rawFields = hasSeconds ? fields : fields.slice(1);

    // always expand all 6 internally
    for (var i = 0; i < 6; i++) {
      var meta = FIELD_META[i];
      var raw = fields[i];
      var isDow = meta.key === "dow";
      expanded[meta.key] = expandField(raw, meta, isDow);
    }

    for (var j = 0; j < metas.length; j++) {
      var m = metas[j];
      var idx = hasSeconds ? j : j + 1;
      descriptions.push({
        key: m.key,
        name: m.name,
        raw: fields[idx],
        desc: describeField(fields[idx], m, m.key === "dow")
      });
    }

    return {
      hasSeconds: hasSeconds,
      raw: trimmed,
      fields: fields,
      expanded: expanded,
      descriptions: descriptions
    };
  }

  function matches(expanded, parts) {
    // parts: {second, minute, hour, day, month, dow} — dow 0=Sun
    if (!expanded.second[parts.second]) return false;
    if (!expanded.minute[parts.minute]) return false;
    if (!expanded.hour[parts.hour]) return false;
    if (!expanded.month[parts.month]) return false;

    var domOk = expanded.dom[parts.day];
    var dowOk = expanded.dow[parts.dow] || expanded.dow[parts.dow === 0 ? 7 : parts.dow];
    // classic cron: if both dom and dow are restricted (not *), OR them;
    // if one is *, AND. We approximate: if both are not full-range, OR; else AND.
    var domAll = isFullRange(expanded.dom, 1, 31);
    var dowAll = isFullRangeDow(expanded.dow);
    if (!domAll && !dowAll) {
      return domOk || dowOk;
    }
    return domOk && dowOk;
  }

  function isFullRange(map, min, max) {
    for (var i = min; i <= max; i++) {
      if (!map[i]) return false;
    }
    return true;
  }

  function isFullRangeDow(map) {
    // 0-6 all present (7 mirrors 0)
    for (var i = 0; i <= 6; i++) {
      if (!map[i] && !map[i === 0 ? 7 : i]) return false;
    }
    return true;
  }

  /** Get Y/M/D/H/M/S/dow in a given IANA timezone for a Date (UTC instant). */
  function zonedParts(date, timeZone) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short"
    });
    var map = {};
    var parts = fmt.formatToParts(date);
    for (var i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    // hour12 false can still yield "24" in some engines for midnight — normalize
    var hour = Number(map.hour);
    if (hour === 24) hour = 0;
    var wd = map.weekday; // Sun Mon ...
    var dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: hour,
      minute: Number(map.minute),
      second: Number(map.second),
      dow: dowMap[wd]
    };
  }

  function formatInZone(date, timeZone) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(date);
  }

  /**
   * Find next N trigger instants after `from` (exclusive-ish: start from next second).
   * Walks second-by-second up to a safety limit; for minute-granularity cron, step by 60s when possible.
   */
  function nextRuns(parsed, timeZone, fromDate, count) {
    count = count || 10;
    var results = [];
    var cursor = new Date(fromDate.getTime());
    // start searching from the next second
    cursor.setUTCMilliseconds(0);
    cursor = new Date(cursor.getTime() + 1000);

    var stepMs = parsed.hasSeconds ? 1000 : 60000;
    if (!parsed.hasSeconds) {
      // align to next whole minute in UTC math; matching uses zoned parts
      var p0 = zonedParts(cursor, timeZone);
      if (p0.second !== 0) {
        cursor = new Date(cursor.getTime() + (60 - p0.second) * 1000);
      }
    }

    var maxIter = parsed.hasSeconds ? 366 * 24 * 3600 : 366 * 24 * 60;
    var iter = 0;
    while (results.length < count && iter < maxIter) {
      iter++;
      var p = zonedParts(cursor, timeZone);
      var check = {
        second: parsed.hasSeconds ? p.second : 0,
        minute: p.minute,
        hour: p.hour,
        day: p.day,
        month: p.month,
        dow: p.dow
      };
      if (!parsed.hasSeconds) check.second = 0;

      if (matches(parsed.expanded, check)) {
        // For 5-field, only fire when zoned second is 0
        if (!parsed.hasSeconds && p.second !== 0) {
          cursor = new Date(cursor.getTime() + stepMs);
          continue;
        }
        results.push(new Date(cursor.getTime()));
      }
      cursor = new Date(cursor.getTime() + stepMs);
    }
    return results;
  }

  /** Minutes in "today" (in TZ) that fire — for 24h canvas. */
  function dayMinuteHits(parsed, timeZone, refDate) {
    var p = zonedParts(refDate, timeZone);
    // Build a list of Date for each minute of that civil day — approximate by scanning 24h window
    // Find UTC range covering that local day by walking from a guess.
    var hits = {}; // key "H:M" or minute-of-day 0..1439
    // Scan from local midnight: start near refDate - offset
    var probe = new Date(refDate.getTime());
    // rewind up to 36h to find start of day
    var start = null;
    for (var back = 0; back < 36 * 60; back++) {
      var pp = zonedParts(probe, timeZone);
      if (pp.year === p.year && pp.month === p.month && pp.day === p.day && pp.hour === 0 && pp.minute === 0) {
        start = new Date(probe.getTime());
        // align second
        if (pp.second) start = new Date(start.getTime() - pp.second * 1000);
        break;
      }
      probe = new Date(probe.getTime() - 60000);
    }
    if (!start) {
      // fallback: use ref truncated
      start = new Date(refDate.getTime());
    }

    var cur = new Date(start.getTime());
    for (var m = 0; m < 24 * 60; m++) {
      var zp = zonedParts(cur, timeZone);
      if (zp.day !== p.day || zp.month !== p.month || zp.year !== p.year) break;
      var check = {
        second: 0,
        minute: zp.minute,
        hour: zp.hour,
        day: zp.day,
        month: zp.month,
        dow: zp.dow
      };
      if (matches(parsed.expanded, check)) {
        hits[zp.hour * 60 + zp.minute] = true;
      }
      cur = new Date(cur.getTime() + 60000);
    }
    return { hits: hits, label: p.year + "-" + pad(p.month) + "-" + pad(p.day) };
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // —— UI ——
  var $ = function (id) {
    return document.getElementById(id);
  };

  function render() {
    var expr = $("cronInput").value;
    var tz = $("tzSelect").value;
    var errEl = $("error");
    errEl.className = "error";
    errEl.textContent = "";

    try {
      var parsed = parseCron(expr);
      renderFields(parsed);
      var now = new Date();
      var runs = nextRuns(parsed, tz, now, 10);
      renderNext(runs, tz);
      var day = dayMinuteHits(parsed, tz, now);
      renderDay(day);
    } catch (e) {
      errEl.textContent = e.message || String(e);
      errEl.className = "error show";
      $("fields").innerHTML = "";
      $("nextList").innerHTML = "<li style='color:var(--muted)'>—</li>";
      $("dayMeta").textContent = "";
      $("dayGrid").innerHTML = "";
    }
  }

  function renderFields(parsed) {
    var html = "";
    for (var i = 0; i < parsed.descriptions.length; i++) {
      var d = parsed.descriptions[i];
      html +=
        '<div class="field-card"><div class="name">' +
        d.name +
        '</div><div class="raw">' +
        escapeHtml(d.raw) +
        '</div><div class="desc">' +
        escapeHtml(d.desc) +
        "</div></div>";
    }
    $("fields").innerHTML = html;
  }

  function renderNext(runs, tz) {
    if (!runs.length) {
      $("nextList").innerHTML = "<li style='color:var(--muted)'>在合理范围内未找到下次触发</li>";
      return;
    }
    var html = "";
    for (var i = 0; i < runs.length; i++) {
      html +=
        "<li><span><span class='idx'>" +
        (i + 1) +
        ".</span> " +
        escapeHtml(formatInZone(runs[i], tz)) +
        "</span><span style='color:var(--muted);font-size:0.78rem'>" +
        escapeHtml(tz) +
        "</span></li>";
    }
    $("nextList").innerHTML = html;
  }

  function renderDay(day) {
    $("dayMeta").textContent =
      "今日（" + day.label + "）按分钟点亮；每列一小时，列内约 12 格（每 5 分钟）";
    var grid = $("dayGrid");
    grid.innerHTML = "";
    for (var h = 0; h < 24; h++) {
      var col = document.createElement("div");
      col.className = "hour-col";
      var lab = document.createElement("div");
      lab.className = "hour-label";
      lab.textContent = h;
      col.appendChild(lab);
      for (var slot = 0; slot < 12; slot++) {
        var on = false;
        for (var m = 0; m < 5; m++) {
          if (day.hits[h * 60 + slot * 5 + m]) {
            on = true;
            break;
          }
        }
        var cell = document.createElement("div");
        cell.className = "cell" + (on ? " on" : "");
        cell.title = pad(h) + ":" + pad(slot * 5) + (on ? " 有触发" : "");
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function init() {
    $("cronInput").addEventListener("input", render);
    $("tzSelect").addEventListener("change", render);
    var presets = document.querySelectorAll("[data-cron]");
    for (var i = 0; i < presets.length; i++) {
      presets[i].addEventListener("click", function (ev) {
        $("cronInput").value = ev.currentTarget.getAttribute("data-cron");
        render();
      });
    }
    render();
  }

  // Export for smoke tests (Node)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseCron: parseCron,
      nextRuns: nextRuns,
      dayMinuteHits: dayMinuteHits,
      zonedParts: zonedParts,
      formatInZone: formatInZone
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
