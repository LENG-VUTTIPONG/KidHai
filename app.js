(function(){
  var UNITS = {
    ml:{kind:"v",f:1}, L:{kind:"v",f:1000},
    g:{kind:"w",f:1},  kg:{kind:"w",f:1000},
    "ชิ้น":{kind:"p",f:1}
  };
  var PER = { v:{n:100,label:"100 ml"}, w:{n:100,label:"100 g"}, p:{n:1,label:"ชิ้น"} };
  var LETTERS = "ABCDEF";
  var MAX = 6, KEY = "kum-mai-v1";
  var CAM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
  var list = document.getElementById("list");
  var camInput = document.getElementById("cam");
  var state, camTarget = -1;
  var jobs = {};   // index -> {ctl, msg}

  function blank(){ return {count:"",size:"",unit:"ml",price:""}; }
  function load(){
    try{
      var s = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(s) && s.length >= 2) return s.map(function(x){
        return {count:x.count||"",size:x.size||"",unit:UNITS[x.unit]?x.unit:"ml",price:x.price||""};
      });
    }catch(e){}
    return [blank(), blank()];
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
  function num(v){
    var n = parseFloat(String(v).replace(/,/g,""));
    return isFinite(n) ? n : NaN;
  }
  function fmt(n){
    var d = n >= 100 ? 1 : 2;
    return n.toLocaleString("th-TH",{minimumFractionDigits:d,maximumFractionDigits:d});
  }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  function render(){
    list.innerHTML = "";
    state.forEach(function(it, i){
      var el = document.createElement("section");
      el.className = "item";
      el.setAttribute("aria-label","ตัวเลือก " + LETTERS[i]);
      var opts = Object.keys(UNITS).map(function(u){
        return '<option value="'+u+'"'+(u===it.unit?" selected":"")+'>'+u+'</option>';
      }).join("");
      el.innerHTML =
        '<div class="top"><div class="name">'+LETTERS[i]+'</div><div class="actions">' +
          '<button class="act cam" type="button" aria-label="ถ่ายรูปตัวเลือก '+LETTERS[i]+'">'+CAM_ICON+'ถ่ายรูป</button>' +
          '<button class="act clear" type="button">ล้าง</button>' +
          (state.length > 2 ? '<button class="act remove" type="button" aria-label="ลบตัวเลือก '+LETTERS[i]+'">×</button>' : '') +
        '</div></div>' +
        '<div class="row">' +
          '<label><span>จำนวน</span><div class="field"><input data-k="count" inputmode="decimal" enterkeyhint="next" placeholder="1" value="'+esc(it.count)+'"></div></label>' +
          '<div class="x">×</div>' +
          '<label><span>ขนาดต่อชิ้น</span><div class="field"><input data-k="size" inputmode="decimal" enterkeyhint="next" placeholder="500" value="'+esc(it.size)+'"><select data-k="unit" aria-label="หน่วย">'+opts+'</select></div></label>' +
        '</div>' +
        '<div class="row2"><label><span>ราคารวม</span><div class="field"><input data-k="price" inputmode="decimal" enterkeyhint="next" placeholder="50" value="'+esc(it.price)+'"><span class="suffix">บาท</span></div></label></div>' +
        '<div class="result empty" aria-live="polite"><div class="per">ใส่ขนาดและราคา</div><div class="note"></div></div>';
      el.addEventListener("input", function(e){
        var k = e.target.getAttribute("data-k");
        if (!k) return;
        state[i][k] = e.target.value;
        if (jobs[i] && jobs[i].msg) jobs[i].msg = null;
        save(); compute();
      });
      el.addEventListener("change", function(e){
        if (e.target.tagName === "SELECT"){ state[i].unit = e.target.value; save(); compute(); }
      });
      el.querySelector(".cam").addEventListener("click", function(){
        camTarget = i; camInput.value = ""; camInput.click();
      });
      el.querySelector(".clear").addEventListener("click", function(){
        cancelJob(i);
        var u = state[i].unit; state[i] = blank(); state[i].unit = u;
        save(); render();
      });
      var rm = el.querySelector(".remove");
      if (rm) rm.addEventListener("click", function(){ cancelAll(); state.splice(i,1); save(); render(); });
      list.appendChild(el);
    });
    document.getElementById("add").disabled = state.length >= MAX;
    compute();
  }

  function setStatus(i, html, cls){
    var card = list.querySelectorAll(".item")[i]; if (!card) return;
    var res = card.querySelector(".result");
    res.className = "result " + cls;
    res.querySelector(".per").innerHTML = html;
    res.querySelector(".note").textContent = "";
    card.classList.remove("best");
  }

  function compute(){
    var cards = list.querySelectorAll(".item");
    var rows = state.map(function(it){
      var c = it.count === "" ? 1 : num(it.count);
      var s = num(it.size), p = num(it.price), u = UNITS[it.unit];
      if (!(c > 0 && s > 0 && p > 0)) return null;
      var base = c * s * u.f;
      return { kind:u.kind, per: p / base * PER[u.kind].n, total:c*s, unit:it.unit };
    });
    var valid = rows.filter(Boolean);
    var kinds = {};
    valid.forEach(function(r){ kinds[r.kind] = 1; });
    var mixed = Object.keys(kinds).length > 1;
    document.getElementById("warn").classList.toggle("show", mixed);

    var best = Infinity, second = Infinity;
    if (!mixed && valid.length >= 2){
      valid.forEach(function(r){ if (r.per < best) best = r.per; });
      valid.forEach(function(r){ if (r.per > best * 1.0001 && r.per < second) second = r.per; });
    }

    rows.forEach(function(r, i){
      var card = cards[i], res = card.querySelector(".result");
      var job = jobs[i];
      if (job && job.ctl){
        setStatus(i, '<span class="label">'+esc(ocrProgress || 'กำลังอ่านรูป…')+'</span> <button class="cancel" type="button">ยกเลิก</button>', "busy");
        res.querySelector(".cancel").onclick = function(){ cancelJob(i); compute(); };
        return;
      }
      if (job && job.msg && !r){ setStatus(i, esc(job.msg), "err"); return; }
      var per = res.querySelector(".per"), note = res.querySelector(".note");
      card.classList.remove("best");
      res.className = "result";
      if (!r){
        res.classList.add("empty");
        per.textContent = "ใส่ขนาดและราคา"; note.textContent = "";
        return;
      }
      var readLine = job && job.msg ? '<span class="read">'+esc(job.msg)+'</span>' : '';
      per.innerHTML = fmt(r.per) + ' ฿ <small>/ ' + PER[r.kind].label + '</small>' + readLine;
      note.textContent = "";
      if (!isFinite(best)) {
        note.textContent = "รวม " + fmt(r.total).replace(/\.0+$/,"") + " " + r.unit;
        return;
      }
      if (r.per <= best * 1.0001){
        card.classList.add("best");
        note.textContent = isFinite(second)
          ? "คุ้มสุด ถูกกว่า " + Math.round((second - best) / second * 100) + "%"
          : "เท่ากัน";
      } else {
        var pct = (r.per - best) / best * 100;
        note.textContent = "แพงกว่า " + (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + "%";
      }
    });
  }

  function cancelJob(i){ if (jobs[i] && jobs[i].ctl) jobs[i].ctl.abort(); delete jobs[i]; }
  function cancelAll(){ Object.keys(jobs).forEach(function(k){ cancelJob(k); }); }

  // ---------- On-device OCR (Tesseract.js) ----------
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var workerPromise = null, ocrProgress = "";

  function loadScript(src){
    return new Promise(function(res, rej){
      if (window.Tesseract) return res();
      var s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = function(){ rej(new Error("load")); };
      document.head.appendChild(s);
    });
  }
  function getWorker(onProgress){
    if (!workerPromise){
      workerPromise = loadScript(TESS_URL).then(function(){
        return Tesseract.createWorker("tha+eng", 1, {
          logger: function(m){ if (window.__ocrLog) window.__ocrLog(m); }
        });
      }).catch(function(e){ workerPromise = null; throw e; });
    }
    window.__ocrLog = onProgress;
    return workerPromise;
  }

  // Shrink, grayscale and boost contrast: faster and more accurate OCR
  function prepImage(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        var x = c.getContext("2d");
        x.drawImage(img, 0, 0, c.width, c.height);
        var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
        for (var j = 0; j < p.length; j += 4){
          var g = 0.299*p[j] + 0.587*p[j+1] + 0.114*p[j+2];
          g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128));
          p[j] = p[j+1] = p[j+2] = g;
        }
        x.putImageData(d, 0, 0);
        URL.revokeObjectURL(url);
        res(c);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("img")); };
      img.src = url;
    });
  }

  // Turn raw OCR text into {count, size, unit, price}
  function parseTag(raw){
    var t = raw.replace(/[๐-๙]/g, function(ch){ return String("๐๑๒๓๔๕๖๗๘๙".indexOf(ch)); })
      .replace(/(\d),(\d{3})/g, "$1$2")
      .replace(/(\d)\s*[.,]\s*(\d{2})(?!\d)/g, "$1.$2")
      .replace(/[“”"']/g, "")
      .replace(/\s+/g, " ");
    var low = t.toLowerCase();
    var N = "(\\d+(?:\\.\\d+)?)";
    var out = {};

    // size + unit
    var unitMap = [
      [/^(ml|มล|มิลลิลิตร|cc|ซีซี)/, "ml"], [/^(ลิตร|ล\.|l\b|ltr|litre|liter)/, "L"],
      [/^(kg|กก|กิโลกรัม|กิโล)/, "kg"], [/^(g|gm|gr|กรัม|ก\.)/, "g"]
    ];
    var sizeRe = new RegExp(N + "\\s*(มิลลิลิตร|มล\\.?|ml|cc|ซีซี|ลิตร|ltr|litre|liter|l\\b|กิโลกรัม|กก\\.?|kg|กรัม|gm|gr|g\\b)", "gi");
    var m, sizes = [];
    while ((m = sizeRe.exec(low))){
      var u = null;
      for (var k = 0; k < unitMap.length; k++) if (unitMap[k][0].test(m[2])) { u = unitMap[k][1]; break; }
      if (u && parseFloat(m[1]) > 0) sizes.push({v: parseFloat(m[1]), u: u});
    }
    if (sizes.length){ out.size = sizes[0].v; out.unit = sizes[0].u; }

    // count: "x 6", "6 ขวด", "แพ็ค 6", "ซื้อ 3 แถม 1"
    var buy = low.match(/ซื้อ\s*(\d+)\s*(?:ชิ้น|ขวด|กระป๋อง|ซอง|แพ็ค)?\s*แถม\s*(\d+)/);
    var cnt = low.match(/(?:x|×|\*)\s*(\d{1,2})(?!\d|\s*(?:ml|g|มล|กรัม))/) ||
              low.match(/(\d{1,2})\s*(?:ขวด|ชิ้น|กระป๋อง|ซอง|ถุง|กล่อง|ม้วน|ห่อ|pcs|pack)/) ||
              low.match(/(?:แพ็ค|แพค|pack)\s*(\d{1,2})/);
    if (cnt && +cnt[1] > 1) out.count = +cnt[1];

    // price: number next to บาท / ฿ / thb, skipping "ประหยัด/ลด xx บาท"
    var priceRe = new RegExp("(?:฿|thb|b\\.)\\s*" + N + "|" + N + "\\s*(?:บาท|บ\\.|(?:฿|thb)(?!\\s*\\d)|\\.?-)", "gi");
    var prices = [];
    while ((m = priceRe.exec(low))){
      var v = parseFloat(m[1] || m[2]);
      var before = low.slice(Math.max(0, m.index - 12), m.index);
      if (v > 0 && !/ประหยัด|ลด|save|off/.test(before)) prices.push({v: v, at: m.index});
    }
    // a multi-buy promo like "2 ชิ้น 50 บาท" wins
    var promo = low.match(new RegExp("(\\d{1,2})\\s*(?:ชิ้น|ขวด|กระป๋อง|ซอง|แพ็ค)\\s*(?:เพียง|ราคา)?\\s*" + N + "\\s*(?:บาท|฿)"));
    if (promo && +promo[1] > 1){ out.count = +promo[1]; out.price = parseFloat(promo[2]); }
    else if (buy){ out.count = +buy[1] + +buy[2]; if (prices.length) out.price = Math.min.apply(null, prices.map(function(p){return p.v;})) * +buy[1]; }
    else if (prices.length) out.price = Math.min.apply(null, prices.map(function(p){return p.v;}));
    return out;
  }

  camInput.addEventListener("change", function(){
    var file = camInput.files && camInput.files[0];
    var i = camTarget;
    if (!file || i < 0) return;
    cancelJob(i);
    var job = jobs[i] = {ctl: {abort: function(){ job.dead = true; }}, msg: null, dead: false};
    var showProgress = function(text){
      if (jobs[i] !== job) return;
      ocrProgress = text;
      var el = list.querySelectorAll(".item")[i];
      var lbl = el && el.querySelector(".result.busy .label");
      if (lbl) lbl.textContent = text; else compute();
    };
    showProgress("กำลังเตรียมรูป…");
    Promise.all([
      prepImage(file),
      getWorker(function(m){
        var pct = Math.round((m.progress || 0) * 100);
        if (m.status === "recognizing text") showProgress("กำลังอ่าน " + pct + "%");
        else if (/load|initializ/.test(m.status || "")) showProgress("โหลดตัวอ่านภาษาไทย " + pct + "% (ครั้งแรกเท่านั้น)");
      })
    ]).then(function(r){
      if (job.dead) return;
      showProgress("กำลังอ่าน…");
      return r[1].recognize(r[0]);
    }).then(function(res){
      if (!res || job.dead || jobs[i] !== job) return;
      job.ctl = null;
      var d = parseTag(res.data.text || "");
      if (!d.size && !d.price){
        job.msg = "อ่านไม่เจอขนาดหรือราคา ลองถ่ายใกล้ ๆ ให้ป้ายตรงและชัด";
        compute(); return;
      }
      var cur = state[i];
      state[i] = {
        count: d.count ? String(d.count) : cur.count,
        size: d.size ? String(d.size) : cur.size,
        unit: d.unit || cur.unit,
        price: d.price ? String(d.price) : cur.price
      };
      var missing = [];
      if (!d.size) missing.push("ขนาด");
      if (!d.price) missing.push("ราคา");
      job.msg = missing.length
        ? "อ่านไม่เจอ" + missing.join("และ") + " พิมพ์เพิ่มได้เลย"
        : "อ่านจากรูปแล้ว ตรวจตัวเลขอีกครั้งก่อนนะ";
      save(); render();
    }).catch(function(){
      if (jobs[i] !== job) return;
      job.ctl = null;
      job.msg = navigator.onLine === false
        ? "ครั้งแรกต้องต่อเน็ตเพื่อโหลดตัวอ่านภาษาไทย"
        : "อ่านรูปไม่สำเร็จ ลองถ่ายใหม่อีกครั้ง";
      compute();
    });
  });

  // Enter moves to the next field
  list.addEventListener("keydown", function(e){
    if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    var inputs = Array.prototype.slice.call(list.querySelectorAll("input"));
    var idx = inputs.indexOf(e.target);
    if (inputs[idx+1]) inputs[idx+1].focus(); else e.target.blur();
  });

  document.getElementById("add").addEventListener("click", function(){
    if (state.length >= MAX) return;
    var last = state[state.length-1];
    var it = blank(); it.unit = last ? last.unit : "ml";
    state.push(it); save(); render();
    var ins = list.querySelectorAll(".item:last-child input");
    if (ins[0]) ins[0].focus();
  });
  document.getElementById("reset").addEventListener("click", function(){
    cancelAll(); state = [blank(), blank()]; save(); render();
  });

  state = load();
  render();

})();
