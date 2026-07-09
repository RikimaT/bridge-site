var MONTHS=['2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月','1月'];
// 【最重要・削除禁止】このURLは生徒管理アプリ専用バックエンド（getStudents/savePaymentStatus等のdoPost）の旧デプロイ。
// バックエンドのコード自体は本リポジトリに存在せず、このデプロイだけが管理アプリの生命線（2026-07-05調査で確定）。
// GASの「デプロイを管理」画面でこのデプロイをアーカイブ・削除すると管理アプリが全停止する。
// 公開サイト・フォーム用の正デプロイ（AKfycbzeKwDS...）とは別物。安易に差し替えてもいけない（doPostの中身が違う）。
var GAS_URL='https://script.google.com/macros/s/AKfycbyrKjG2C7TLtgTIDCwAA-gh4AhGXR0PP7muzg8u-I2NM3UTpDVxMlA8lda1bhwGPlqpfA/exec';
var ALL_STUDENTS=[],ALL_ENROLL=[],ALL_COURSES=[],ALL_SALES={},ALL_TRIALS=[],ALL_TARGETS={};
var HISTORICAL_SALES={};
fetch('data/sales-history.json').then(function(r){return r.json();}).then(function(d){HISTORICAL_SALES=d;}).catch(function(){});

var regSel=[],addSel=[],addTargetID='',addTargetName='';
var salesYear='',salesMonth='',salesMode='single',salesLoading=false,salesChartObj=null;
var dashTrendChart=null,dashCourseChart=null,dashViewYear=null,dashViewMonth=null;
var _priceCtx={},_endCtx={},_withdrawCtx={},_convertCtx={};
var trialFilter='all';

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ローカルタイムゾーンの今日の日付（toISOStringはUTC基準のため朝9時前に前日になる）
function todayStr(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// overridePriceが有効値（空文字・null・undefined以外）かどうか
function hasOverride(e){return e.overridePrice!==null&&e.overridePrice!==undefined&&e.overridePrice!=='';}
// コース登録1件分の実効月額
function effPrice(e){return hasOverride(e)?parseFloat(e.overridePrice)||0:parseFloat(e.standardPrice)||0;}

/* ========== 五十音順ヘルパー ========== */
// よみ（無ければ氏名）を正規化して並び替えキーにする。
// カタカナ→ひらがな・全角半角ゆらぎ・スペースを吸収し、どんな入力でも正しい位置に並ぶようにする
function yomiKey(s){
  var raw=String((s&&(s.yomi||s.name))||'');
  try{raw=raw.normalize('NFKC');}catch(e){}
  raw=raw.replace(/[ァ-ヶ]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-0x60);});
  return raw.replace(/[\s　]/g,'').toLowerCase();
}
function byYomi(a,b){return yomiKey(a).localeCompare(yomiKey(b),'ja');}

/* ========== 画面ロック（Face ID / Touch ID・登録端末のみ） ========== */
// 合言葉のSHA-256。合言葉を知る人（田中夫妻）だけが端末を登録できる。
// 変更したいときは新しい合言葉のSHA-256に差し替える。
var LOCK_HASH='4b355cd6cc19844a3c8fd44cf16c6c168a2eb81eba0fb74bec0f5f21687c2acc';
var LOCK_SESSION_MS=8*60*60*1000; // 一度解除したら8時間は再認証なし
function _b64(buf){return btoa(String.fromCharCode.apply(null,new Uint8Array(buf)));}
function _unb64(s){var bin=atob(s),a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer;}
function _rand(n){var a=new Uint8Array(n);crypto.getRandomValues(a);return a;}
async function _sha256hex(str){
  var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}
function lockIsOpen(){
  try{
    if(sessionStorage.getItem('bridge_unlocked')==='1')return true;
    var until=parseInt(localStorage.getItem('bridge_lock_until')||'0',10);
    return until>Date.now();
  }catch(e){return true;}
}
function lockInit(){
  // file:// での開発時・非対応ブラウザではロックを掛けない（本番はHTTPSなので必ず掛かる）
  if(location.protocol==='file:'||!window.crypto||!crypto.subtle)return;
  if(lockIsOpen())return;
  var el=document.getElementById('lock-screen');
  el.classList.remove('hide');
  var cred=null;
  try{cred=localStorage.getItem('bridge_lock_cred');}catch(e){}
  if(!cred){lockShowSetup();}
}
function lockShowSetup(){
  document.getElementById('lock-main').classList.add('hide');
  document.getElementById('lock-setup').classList.remove('hide');
}
function lockShowMain(){
  document.getElementById('lock-setup').classList.add('hide');
  document.getElementById('lock-main').classList.remove('hide');
}
function _lockOpen(){
  try{
    sessionStorage.setItem('bridge_unlocked','1');
    localStorage.setItem('bridge_lock_until',String(Date.now()+LOCK_SESSION_MS));
  }catch(e){}
  document.getElementById('lock-screen').classList.add('hide');
}
async function lockRegister(){
  var msg=document.getElementById('lock-setup-msg');
  var pass=document.getElementById('lock-pass').value;
  if(!pass){msg.textContent='合言葉を入力してください';return;}
  var hex=await _sha256hex(pass.trim());
  if(hex!==LOCK_HASH){msg.textContent='合言葉が違います';return;}
  // Phase 3: 合言葉からAPIキーを導出してこの端末に保存（データ通信の鍵。公開コードには載らない）
  try{localStorage.setItem('bridge_api_key',await _sha256hex('bridge-kanri-api|'+pass.trim()));}catch(e){}
  document.getElementById('lock-pass').value='';
  // WebAuthn（Face ID / Touch ID）で端末を登録。非対応端末は合言葉のみで通す。
  // 既に登録済みの端末（鍵の再入力で来た場合）は二重登録しない
  var alreadyCred=null;
  try{alreadyCred=localStorage.getItem('bridge_lock_cred');}catch(e){}
  if(window.PublicKeyCredential&&!alreadyCred){
    msg.style.color='var(--muted)';msg.textContent='Face ID / Touch ID を確認しています…';
    try{
      var cred=await navigator.credentials.create({publicKey:{
        rp:{name:'Bridge 生徒管理'},
        user:{id:_rand(16),name:'bridge-owner',displayName:'Bridge管理者'},
        challenge:_rand(32),
        pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
        authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},
        timeout:60000
      }});
      try{localStorage.setItem('bridge_lock_cred',_b64(cred.rawId));}catch(e){}
      showToast('この端末を登録しました。次回からFace ID / Touch IDで開けます','ok');
    }catch(e){
      // 生体認証の登録がキャンセル・失敗しても合言葉が正しければ通す（次回また登録できる）
    }
    msg.textContent='';msg.style.color='';
  }
  _lockOpen();
  // 再入力フロー（鍵の更新）から来た場合はデータを取り直す
  if(_rekeyMode){_rekeyMode=false;hideConnBanner();loadStudents();}
}

// バックエンドに鍵を拒否されたとき: ロック画面を再表示して合言葉の再入力を求める
var _rekeyMode=false,_rekeyShown=false;
function lockRequireRekey(){
  if(_rekeyShown)return; // 並行する複数リクエストで何度も出さない
  _rekeyShown=true;_rekeyMode=true;
  var el=document.getElementById('lock-screen');
  el.classList.remove('hide');
  lockShowSetup();
  var msg=document.getElementById('lock-setup-msg');
  msg.style.color='var(--muted)';
  msg.textContent='セキュリティ強化のため、合言葉をもう一度入力してください（この端末で1回だけ）';
  setTimeout(function(){_rekeyShown=false;},4000);
}
async function lockUnlock(){
  var msg=document.getElementById('lock-msg');
  var credB64=null;
  try{credB64=localStorage.getItem('bridge_lock_cred');}catch(e){}
  if(!credB64){msg.textContent='この端末は未登録です。合言葉で登録してください';lockShowSetup();return;}
  msg.style.color='var(--muted)';msg.textContent='認証しています…';
  try{
    await navigator.credentials.get({publicKey:{
      challenge:_rand(32),
      allowCredentials:[{type:'public-key',id:_unb64(credB64)}],
      userVerification:'required',
      timeout:60000
    }});
    msg.textContent='';msg.style.color='';
    _lockOpen();
  }catch(e){
    msg.style.color='';
    msg.textContent='認証できませんでした。もう一度お試しいただくか、合言葉をご利用ください';
  }
}

/* ========== 接続バナー・起動キャッシュ ========== */
function showConnBanner(msg){
  var el=document.getElementById('conn-banner');
  if(!el)return;
  document.getElementById('conn-banner-msg').textContent=msg||'サーバーに接続できません';
  el.classList.remove('hide');
}
function hideConnBanner(){var el=document.getElementById('conn-banner');if(el)el.classList.add('hide');}
async function retryConnection(btn){
  if(btn){btn.disabled=true;btn.textContent='接続中...';}
  try{await loadStudents();}finally{if(btn){btn.disabled=false;btn.textContent='再試行';}}
}
// 前回取得したデータを即座に表示して起動を体感ゼロ秒にする（裏で最新に更新）
function saveBootCache(){
  try{
    localStorage.setItem('bridge_cache_v1',JSON.stringify({
      ts:Date.now(),students:ALL_STUDENTS,enroll:ALL_ENROLL,trials:ALL_TRIALS,courses:ALL_COURSES
    }));
  }catch(e){}
}
function loadBootCache(){
  try{
    var s=localStorage.getItem('bridge_cache_v1');
    if(!s)return false;
    var d=JSON.parse(s);
    if(!d||!Array.isArray(d.students)||!d.students.length)return false;
    ALL_STUDENTS=d.students;ALL_ENROLL=d.enroll||[];ALL_TRIALS=d.trials||[];
    if(Array.isArray(d.courses)&&d.courses.length)ALL_COURSES=d.courses;
    return true;
  }catch(e){return false;}
}

document.addEventListener('DOMContentLoaded',function(){
  lockInit();
  document.getElementById('r-join').value=todayStr();
  document.getElementById('tr-date').value=todayStr();
  if(loadBootCache()){renderMgr();renderDashboard();renderPriceSim();}
  loadTargets();
  loadSchools();
  loadCourses();
  loadStudents();
});

// PWA: Service Worker登録（オフライン時も画面は開けるように）
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
}

async function gas(action,extra){
  // Phase 3: 端末登録時に合言葉から導出したAPIキーを毎回添付する（バックエンドが照合）
  var apiKey=null;
  try{apiKey=localStorage.getItem('bridge_api_key');}catch(e){}
  var body=JSON.stringify(Object.assign({action:action},apiKey?{key:apiKey}:{},extra||{}));
  var lastErr=null;
  for(var attempt=0;attempt<3;attempt++){
    try{
      var r=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:body});
      var t=await r.text();
      try{
        var parsed=JSON.parse(t);
        // 鍵が無い・古い端末 → 合言葉の再入力を促す（リトライしても無駄なので即終了）
        if(parsed&&parsed.status==='unauthorized'){lockRequireRekey();throw new Error('合言葉の確認が必要です');}
        return parsed;
      }catch(e){
        if(e&&e.message==='合言葉の確認が必要です')throw e;
        lastErr=new Error('GAS応答エラー: '+t.slice(0,80));
      }
    }catch(e){
      if(e&&e.message==='合言葉の確認が必要です')throw e;
      lastErr=new Error('通信エラー: '+e.message);
    }
    if(attempt<2)await new Promise(function(ok){setTimeout(ok,1000*(attempt+1));});
  }
  throw lastErr;
}

// ヘッダーの更新ボタン: 全データを再取得する（入金キャッシュも破棄）
async function refreshAll(btn){
  if(btn){btn.disabled=true;btn.classList.add('spin');}
  _payCache={};
  try{
    var ok=await loadStudents();
    if(document.getElementById('pane-mgr').classList.contains('active'))loadPaymentForCurrentMonth();
    showToast(ok?'データを更新しました':'更新に失敗しました',ok?'ok':'err');
  }catch(e){
    showToast('更新に失敗しました: '+e.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.classList.remove('spin');}
  }
}

function switchTab(id){
  ['dash','reg','mgr','trial','sales'].forEach(function(t,i){
    document.querySelectorAll('.tab')[i].classList.toggle('active',t===id);
    document.getElementById('pane-'+t).classList.toggle('active',t===id);
  });
  if(id==='dash') renderDashboard();
  if(id==='trial') renderTrials();
  if(id==='sales'){renderPriceSim();if(!salesLoading&&Object.keys(ALL_SALES).length===0)loadSales();}
}

/* ========== SCHOOLS ========== */
async function loadSchools(){
  try{
    var r=await gas('getSchools');
    var sel=document.getElementById('r-school');
    if(r.status==='ok'&&r.schools&&r.schools.length){
      sel.innerHTML='<option value="">未選択</option>';
      r.schools.forEach(function(s){sel.innerHTML+='<option value="'+esc(s)+'">'+esc(s)+'</option>';});
    }else{sel.outerHTML='<input type="text" id="r-school" placeholder="学校名を入力">';}
  }catch(e){var el=document.getElementById('r-school');if(el)el.outerHTML='<input type="text" id="r-school" placeholder="学校名を入力">';}
}

/* ========== COURSES ========== */
async function loadCourses(){
  try{
    var r=await gas('getCourses');
    if(r.status!=='ok') throw new Error(r.message);
    ALL_COURSES=r.courses;
    buildCtabs('reg-ctabs','reg-cgrid','reg');
  }catch(e){document.getElementById('reg-cgrid').innerHTML='<div class="empty">コース取得失敗: '+esc(e.message)+'<br><button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="loadCourses()">再試行</button></div>';}
}

function buildCtabs(tabsId,gridId,mode){
  var cats=['すべて'];
  ALL_COURSES.forEach(function(c){if(c.category&&cats.indexOf(c.category)<0)cats.push(c.category);});
  var h='';
  cats.forEach(function(c,i){h+='<button class="ctab'+(i===0?' active':'')+'" data-cat="'+esc(c)+'" data-tabs="'+esc(tabsId)+'" data-grid="'+esc(gridId)+'" data-mode="'+esc(mode)+'" onclick="filterCgridBtn(this)">'+esc(c)+'</button>';});
  document.getElementById(tabsId).innerHTML=h;
  renderCgrid(gridId,ALL_COURSES,mode);
}

function filterCgridBtn(btn){
  var tabsId=btn.dataset.tabs,gridId=btn.dataset.grid,mode=btn.dataset.mode,cat=btn.dataset.cat;
  document.querySelectorAll('#'+tabsId+' .ctab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  renderCgrid(gridId,cat==='すべて'?ALL_COURSES:ALL_COURSES.filter(function(c){return c.category===cat;}),mode);
}

function renderCgrid(gridId,list,mode){
  var sel=mode==='reg'?regSel:addSel;
  if(!list||!list.length){document.getElementById(gridId).innerHTML='<div class="empty">コースなし</div>';return;}
  var h='';
  list.forEach(function(c){
    var s=sel.some(function(x){return x.courseID===c.courseID;});
    h+='<div class="citem'+(s?' sel':'')+'" data-id="'+esc(c.courseID)+'" data-mode="'+esc(mode)+'" onclick="toggleCEl(this)">';
    h+='<div><div class="cname">'+esc(c.courseName||c.displayName||c.courseID)+'</div><div class="cprice">'+(c.price?'¥'+Number(c.price).toLocaleString():'--')+'</div></div>';
    h+='<div class="ccheck">'+(s?'✓':'')+'</div></div>';
  });
  document.getElementById(gridId).innerHTML=h;
}

function toggleCEl(el){toggleC(el.dataset.id,el.dataset.mode);}
function toggleCByBtn(btn,mode){toggleC(btn.dataset.cid,mode);}

function toggleC(courseID,mode){
  var arr=mode==='reg'?regSel:addSel;
  var course=null;ALL_COURSES.forEach(function(c){if(c.courseID===courseID)course=c;});
  if(!course)return;
  var idx=-1;arr.forEach(function(s,i){if(s.courseID===courseID)idx=i;});
  if(idx>=0)arr.splice(idx,1);else arr.push(course);
  var gid=mode==='reg'?'reg-cgrid':'add-cgrid';
  document.querySelectorAll('#'+gid+' .citem').forEach(function(el){
    if(el.dataset.id===courseID){var s=arr.some(function(x){return x.courseID===courseID;});el.classList.toggle('sel',s);el.querySelector('.ccheck').innerHTML=s?'✓':'';}
  });
  if(mode==='reg'){renderRegTags();updateRegTotal();}else renderAddTags();
}

function renderRegTags(){
  document.getElementById('reg-stags').innerHTML=regSel.map(function(s){
    return '<span class="stag">'+esc(s.courseName||s.courseID)+'<button data-cid="'+esc(s.courseID)+'" onclick="toggleCByBtn(this,\'reg\')">×</button></span>';
  }).join('');
}
function updateRegTotal(){document.getElementById('reg-total').textContent=regSel.reduce(function(s,c){return s+(Number(c.price)||0);},0).toLocaleString();}
function renderAddTags(){document.getElementById('add-stags').innerHTML=addSel.map(function(s){return '<span class="stag">'+esc(s.courseName||s.courseID)+'</span>';}).join('');}

/* ========== REGISTRATION ========== */
async function submitReg(){
  var name=document.getElementById('r-name').value.trim();
  if(!name){showToast('氏名を入力してください','err');return;}
  // よみは五十音順の並びの生命線なので必須にする（新規追加者が並びから外れる事故を防ぐ）
  if(!document.getElementById('r-yomi').value.trim()){showToast('「よみ」を入力してください（五十音順の並びに使います）','err');document.getElementById('r-yomi').focus();return;}
  var btn=document.getElementById('reg-btn');btn.disabled=true;btn.textContent='登録中...';
  try{
    var schoolEl=document.getElementById('r-school');
    var p={name:name,yomi:document.getElementById('r-yomi').value.trim(),grade:document.getElementById('r-grade').value,school:schoolEl?schoolEl.value:'',joinDate:document.getElementById('r-join').value,memo:document.getElementById('r-memo').value.trim(),lineId:document.getElementById('r-line').value.trim(),phone:document.getElementById('r-phone').value.trim()};
    var r=await gas('addStudent',p);
    if(r.status!=='ok')throw new Error(r.message);
    for(var i=0;i<regSel.length;i++){
      var c=regSel[i];
      await gas('addEnrollment',{studentID:r.studentID,studentName:name,courseID:c.courseID,courseName:c.courseName||c.displayName||c.courseID,standardPrice:c.price||0,startDate:p.joinDate});
    }
    showToast(name+' を登録しました','ok');
    ['r-name','r-yomi','r-memo','r-line','r-phone'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('r-grade').value='';document.getElementById('r-join').value=todayStr();
    if(schoolEl)schoolEl.value='';
    regSel=[];renderRegTags();updateRegTotal();
    document.querySelectorAll('#reg-cgrid .citem').forEach(function(el){el.classList.remove('sel');el.querySelector('.ccheck').innerHTML='';});
    await loadStudents();
  }catch(e){showToast('エラー: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='登録する';}
}

/* ========== STUDENTS ========== */
async function loadStudents(){
  try{
    var settled=await Promise.allSettled([gas('getStudents'),gas('getEnrollments'),gas('getTrials'),gas('getCourses')]);
    var res=settled.map(function(r){return r.status==='fulfilled'?r.value:{status:'error'};});
    // 生徒一覧が取れなかったら「0名」で静かに固まらず、はっきり失敗として扱う
    if(res[0].status!=='ok'){
      var reason=settled[0].status==='rejected'?(settled[0].reason&&settled[0].reason.message||'通信エラー'):(res[0].message||'サーバーエラー');
      throw new Error(reason);
    }
    if(res[0].status==='ok')ALL_STUDENTS=res[0].students;
    if(res[1].status==='ok')ALL_ENROLL=res[1].enrollments;
    if(res[2]&&res[2].status==='ok')ALL_TRIALS=res[2].trials||[];
    if(res[3]&&res[3].status==='ok'){
      ALL_COURSES=res[3].courses;
      var priceMap={};
      ALL_COURSES.forEach(function(c){priceMap[c.courseID]=c.price||0;});
      ALL_ENROLL.forEach(function(e){
        if(priceMap[e.courseID]!==undefined){
          var oldStd=parseFloat(e.standardPrice)||0;
          var newStd=priceMap[e.courseID];
          // overridePriceが旧standardPriceと同値 → マスター追従の残骸（真の例外ではない）→ クリアしてマスター価格を使用
          if(hasOverride(e)&&parseFloat(e.overridePrice)===oldStd){e.overridePrice='';}
          e.standardPrice=newStd;
        }
      });
    }
    hideConnBanner();
    saveBootCache();
    renderMgr();
    renderDashboard();
    renderPriceSim();
  }catch(e){
    showConnBanner('サーバーに接続できません: '+e.message);
    // キャッシュ表示中ならデータはそのまま残す（バナーだけで知らせる）
    if(!ALL_STUDENTS.length){
      var errHtml='<div class="empty">読み込みエラー: '+esc(e.message)+'<br><button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="loadStudents()">再試行</button></div>';
      document.getElementById('mgr-list').innerHTML=errHtml;
      document.getElementById('dash-content').innerHTML=errHtml;
    }
    return false;
  }
  return true;
}

function calcMonths(dateStr){
  if(!dateStr)return 0;
  var d=new Date(dateStr),now=new Date();
  return Math.max(0,(now.getFullYear()-d.getFullYear())*12+(now.getMonth()-d.getMonth()));
}

// 生徒タブ: 学年フィルター（'all'=すべて）
var mgrGradeFilter='all';
function mgrGradeOf(s){return GRADE_ORDER.indexOf(s.grade)>=0?s.grade:'未設定';}
function renderMgrGradeTabs(activeList){
  var box=document.getElementById('mgr-grade-tabs');
  if(!box)return;
  var counts={};
  activeList.forEach(function(s){var g=mgrGradeOf(s);counts[g]=(counts[g]||0)+1;});
  var grades=GRADE_ORDER.concat(['未設定']).filter(function(g){return counts[g];});
  var h='<button class="ctab'+(mgrGradeFilter==='all'?' active':'')+'" onclick="setMgrGradeFilter(\'all\')">すべて <span class="ctab-count">'+activeList.length+'</span></button>';
  grades.forEach(function(g){
    h+='<button class="ctab'+(mgrGradeFilter===g?' active':'')+'" onclick="setMgrGradeFilter(\''+esc(g)+'\')">'+esc(g)+' <span class="ctab-count">'+counts[g]+'</span></button>';
  });
  box.innerHTML=h;
}
function setMgrGradeFilter(g){mgrGradeFilter=g;renderMgr();}

function renderMgr(){
  var q=(document.getElementById('mgr-search').value||'').toLowerCase();
  var activeList=ALL_STUDENTS.filter(function(s){return s.isActive;});
  renderMgrGradeTabs(activeList);
  var list=mgrGradeFilter==='all'?activeList:activeList.filter(function(s){return mgrGradeOf(s)===mgrGradeFilter;});
  if(q)list=list.filter(function(s){return (s.name+' '+(s.yomi||'')+' '+(s.grade||'')+' '+(s.school||'')).toLowerCase().indexOf(q)>=0;});
  list.sort(byYomi);
  var el=document.getElementById('mgr-list');
  if(!list.length){el.innerHTML='<div class="empty">'+(mgrGradeFilter==='all'?'在籍中の生徒がいません':esc(mgrGradeFilter)+'の生徒はいません')+'</div>';return;}
  var h='';
  list.forEach(function(s){
    var enrolls=ALL_ENROLL.filter(function(e){return e.studentID===s.studentID&&e.isActive;});
    var monthly=enrolls.reduce(function(sum,e){return sum+(effPrice(e));},0);
    var months=calcMonths(s.joinDate);
    var ltv=monthly*months;
    var cr='';
    if(enrolls.length){
      enrolls.forEach(function(e){
        var price=effPrice(e);
        var ov=hasOverride(e)?'<span style="font-size:10px;color:var(--accent);margin-left:5px;">上書</span>':'';
        cr+='<div class="enroll-row"><div style="flex:1;min-width:0;"><div class="er-course">'+esc(e.courseName||e.courseID)+'</div>';
        cr+='<div class="er-meta">開始: '+esc(e.startDate||'--')+ov+'</div></div>';
        cr+='<div style="display:flex;align-items:center;gap:6px;"><span class="er-price">¥'+price.toLocaleString()+'</span>';
        cr+='<button class="btn btn-ghost btn-sm" data-eid="'+esc(e.enrollID)+'" data-cn="'+esc(e.courseName||'')+'" data-p="'+Number(price)+'" data-sid="'+esc(s.studentID)+'" onclick="editPriceBtn(this)">変更</button>';
        cr+='<button class="btn btn-danger btn-sm" data-eid="'+esc(e.enrollID)+'" data-sid="'+esc(s.studentID)+'" data-cn="'+esc(e.courseName||'')+'" onclick="endEnrollBtn(this)">終了</button>';
        cr+='</div></div>';
      });
    }else{cr='<div style="font-size:13px;color:var(--muted);padding:6px 0;">コース未登録</div>';}
    var clist=enrolls.map(function(e){return '<span style="margin-right:6px;font-size:12px;color:var(--muted);">'+esc(e.courseName||e.courseID)+'</span>';}).join('');
    var lineInfo=s.lineId?'<span style="font-size:11px;color:var(--muted);">LINE: '+esc(s.lineId)+'</span>':'';
    var phoneInfo=s.phone?'<span style="font-size:11px;color:var(--muted);">📞 '+esc(s.phone)+'</span>':'';
    h+='<div class="scard"><div class="scard-head" data-card="sd-'+esc(s.studentID)+'" onclick="toggleCardEl(this)">';
    h+='<div style="flex:1;min-width:0;"><div class="sname">'+esc(s.name)+'</div>';
    h+='<div class="sinfo">'+esc(s.grade||'--')+(s.school?' / '+esc(s.school):'')+'</div>';
    h+='<div class="ltv-row"><span>在籍 <span class="ltv-val">'+months+'ヶ月</span></span><span>累計 <span class="ltv-val">¥'+ltv.toLocaleString()+'</span></span>'+(lineInfo?'<span>'+lineInfo+'</span>':'')+(phoneInfo?'<span>'+phoneInfo+'</span>':'')+'</div>';
    h+='<div style="margin-top:4px;">'+(clist||'<span style="font-size:12px;color:var(--muted);">コースなし</span>')+'</div></div>';
    h+='<div style="text-align:right;flex-shrink:0;"><span class="badge badge-ok">在籍</span><br>';
    h+='<span class="stotal" style="margin-top:6px;display:block;">¥'+monthly.toLocaleString()+'/月</span></div>'+'<label onclick="event.stopPropagation()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0 10px;cursor:pointer;border-left:1px solid var(--border);min-width:52px;">'+'<input type="checkbox" '+(window._payData&&window._payData[s.studentID]?'checked':'')+' data-sid="'+esc(s.studentID)+'" onchange="togglePayment(this.dataset.sid,this.checked)" style="width:20px;height:20px;accent-color:var(--accent);cursor:pointer;">'+'<span style="font-size:10px;margin-top:2px;color:var(--muted);">入金</span></label></div>';
    h+='<div class="scard-detail" id="sd-'+esc(s.studentID)+'">'+cr;
    h+='<div class="action-row">';
    h+='<button class="btn btn-ghost" style="flex:1;" data-sid="'+esc(s.studentID)+'" data-name="'+esc(s.name)+'" onclick="openAddModalBtn(this)">+ コース追加</button>';
    h+='<button class="btn btn-danger" style="flex:1;" data-sid="'+esc(s.studentID)+'" data-name="'+esc(s.name)+'" onclick="doWithdrawBtn(this)">退会処理</button>';
    h+='</div></div></div>';
  });
  el.innerHTML=h;
}

function toggleCardEl(el){var card=document.getElementById(el.dataset.card);if(card)card.classList.toggle('open');}

/* ========== 月次ヘルパー（概況・未入金・売上で共用） ========== */
// 指定月に在籍していた生徒一覧（現在月はisActiveフラグ、過去月は入退会日ベース）
function studentsForMonth(yr,mo){
  var now=new Date();
  if(yr===now.getFullYear()&&mo===now.getMonth()+1)return ALL_STUDENTS.filter(function(s){return s.isActive;});
  var monthEnd=new Date(yr,mo,0),monthStart=new Date(yr,mo-1,1);
  return ALL_STUDENTS.filter(function(s){
    if(!s.joinDate)return false;
    if(new Date(s.joinDate)>monthEnd)return false;
    if(s.leaveDate&&new Date(s.leaveDate)<monthStart)return false;
    return true;
  });
}
// 指定月に在籍していたコース登録。未来月は現在の在籍を見込みとして繰り越す。
// 過去月は「登録開始日」と「生徒の入退会日」からその月のものだけを対象にする
// （これをしないと全月が現在の在籍で計算され、同じ金額になってしまう）
function enrollsForMonth(yr,mo){
  var now=new Date();
  var isCurrent=yr===now.getFullYear()&&mo===now.getMonth()+1;
  var isFuture=new Date(yr,mo-1,2)>now;
  if(isCurrent||isFuture)return ALL_ENROLL.filter(function(e){return e.isActive;});
  var monthEnd=new Date(yr,mo,0),monthStart=new Date(yr,mo-1,1);
  var stuMap={};
  ALL_STUDENTS.forEach(function(s){stuMap[s.studentID]=s;});
  return ALL_ENROLL.filter(function(e){
    if(e.startDate&&new Date(e.startDate)>monthEnd)return false;       // この月にはまだ登録が始まっていない
    var st=stuMap[e.studentID];
    if(st){
      if(st.joinDate&&new Date(st.joinDate)>monthEnd)return false;     // 生徒がまだ入会前
      if(st.leaveDate&&new Date(st.leaveDate)<monthStart)return false; // 生徒が退会済み
    }else if(!e.isActive){
      return false;                                                    // 生徒が見つからず非アクティブな登録は除外
    }
    return true;
  });
}
// 年度の12ヶ月分の売上キー（2月始まり〜翌1月）
function fiscalKeys(yr){
  var keys=MONTHS.slice(0,11).map(function(m){return yr+'年'+m;});
  keys.push((yr+1)+'年1月');
  return keys;
}

/* ========== DASHBOARD ========== */
function initDashMonth(){if(!dashViewYear){var now=new Date();dashViewYear=now.getFullYear();dashViewMonth=now.getMonth()+1;}}
function changeDashMonth(delta){
  initDashMonth();
  dashViewMonth+=delta;
  if(dashViewMonth>12){dashViewMonth=1;dashViewYear++;}
  if(dashViewMonth<1){dashViewMonth=12;dashViewYear--;}
  renderDashboard();
}
function jumpToCurrentDashMonth(){var now=new Date();dashViewYear=now.getFullYear();dashViewMonth=now.getMonth()+1;renderDashboard();}
function renderDashboard(){
  if(!document.getElementById('pane-dash').classList.contains('active')) return;
  initDashMonth();
  var yr=dashViewYear,mo=dashViewMonth;
  var now=new Date();
  var isCurrentMonth=yr===now.getFullYear()&&mo===now.getMonth()+1;
  var isFuture=new Date(yr,mo-1,2)>now;
  var monthLabel=yr+'年'+mo+'月';
  var salesKey=yr+'年'+mo+'月';
  var activeStudents=studentsForMonth(yr,mo);
  var joins=ALL_STUDENTS.filter(function(s){if(!s.joinDate)return false;var d=new Date(s.joinDate);return d.getFullYear()===yr&&d.getMonth()===mo-1;}).length;
  var leaves=ALL_STUDENTS.filter(function(s){if(!s.leaveDate||s.isActive)return false;var d=new Date(s.leaveDate);return d.getFullYear()===yr&&d.getMonth()===mo-1;}).length;
  var salesData=(ALL_SALES&&ALL_SALES[salesKey])||HISTORICAL_SALES[salesKey]||null;
  var monthEnrolls=enrollsForMonth(yr,mo);
  var currentMonthlyTotal=monthEnrolls.reduce(function(s,e){return s+(effPrice(e));},0);
  var monthlyTotal=salesData&&salesData.total?salesData.total:currentMonthlyTotal;
  var monthlyLabel=salesData&&salesData.total?'月額実績':(isFuture?'見込み月額':'在籍月額');
  // 延べ在籍数＝その月に在籍していたコース登録数（実人数は別途表示）
  var enrollCount=monthEnrolls.length;
  var realCount=activeStudents.length;
  var totalMonths=activeStudents.map(function(s){return calcMonths(s.joinDate);});
  var avgMonths=totalMonths.length?Math.round(totalMonths.reduce(function(a,b){return a+b;},0)/totalMonths.length):0;
  var netDelta=joins-leaves;
  var netStr=(netDelta>0?'+':'')+netDelta;
  var netClass=netDelta>0?'pos':netDelta<0?'neg':'';
  var h='';
  h+='<div class="month-nav" style="margin-bottom:18px;">';
  h+='<button class="navbtn" onclick="changeDashMonth(-1)">◀</button>';
  h+='<span class="month-nav-label" style="font-size:15px;font-weight:700;min-width:110px;">'+monthLabel+'</span>';
  h+='<button class="navbtn" onclick="changeDashMonth(1)">▶</button>';
  if(!isCurrentMonth)h+='<button class="navbtn-today" onclick="jumpToCurrentDashMonth()">今月</button>';
  h+='</div>';
  if(isCurrentMonth){
    h+='<div class="dash-chart-wrap todo-wrap"><div class="dash-chart-title">✅ 今日やること</div><div id="dash-todo"><div style="font-size:13px;color:var(--muted);padding:6px 0;">確認中...</div></div></div>';
  }
  h+='<div class="kpi-grid">';
  h+='<div class="kpi-card"><div class="kpi-label">延べ在籍数</div><div class="kpi-val">'+enrollCount+'<span style="font-size:14px;color:var(--muted);">名</span></div><div class="kpi-sub">実人数 <span class="ltv-val">'+realCount+'名</span>　平均 <span class="ltv-val">'+avgMonths+'ヶ月</span></div></div>';
  h+='<div class="kpi-card"><div class="kpi-label">'+monthlyLabel+'</div><div class="kpi-val" style="font-size:20px;">¥'+monthlyTotal.toLocaleString()+'</div>';
  if(salesData&&salesData.actual){h+='<div class="kpi-sub">入金: <span style="color:var(--ok)">¥'+salesData.actual.toLocaleString()+'</span></div>';}
  else{h+='<div class="kpi-sub" style="color:var(--muted);">在籍ベース</div>';}
  h+='</div>';
  h+='<div class="kpi-card"><div class="kpi-label">'+mo+'月 入会 / 退会</div><div class="kpi-val '+netClass+'">'+netStr+'</div><div class="kpi-sub">+'+joins+' / -'+leaves+'</div></div>';
  h+='</div>';
  if(isCurrentMonth){
    h+='<div class="dash-chart-wrap"><div class="dash-chart-title">📈 今月の着地予測</div><div id="dash-forecast"><div style="font-size:13px;color:var(--muted);padding:6px 0;">読込中...</div></div></div>';
  }
  h+=buildGradePanel();
  h+=buildLtvPanel();
  if(!isFuture)h+='<div class="dash-chart-wrap"><div class="dash-chart-title">未入金一覧（'+monthLabel+'）</div><div id="dash-unpaid"><div style="font-size:13px;color:var(--muted);padding:6px 0;">読込中...</div></div></div>';
  h+='<div class="dash-chart-wrap"><div class="dash-chart-title">入退会推移（直近6ヶ月）</div><canvas id="dash-trend-canvas" class="dash-chart-canvas"></canvas></div>';
  h+='<div class="dash-chart-wrap"><div class="dash-chart-title">コース別月額構成</div><div class="course-bar-wrap" id="course-dist"></div></div>';
  document.getElementById('dash-content').innerHTML=h;
  if(isCurrentMonth)renderDashTodo(yr,mo);
  if(!isFuture)renderDashUnpaid(yr,mo);
  try{buildDashTrendChart();}catch(e){console.error('trend chart:',e);}
  try{buildCourseDistChart();}catch(e){console.error('course chart:',e);}
}

/* ========== 学年別在籍・卒業予測 / LTV ========== */
var GRADE_ORDER=['幼児','小1','小2','小3','小4','小5','小6','中1','中2','中3','高1','高2','高3'];

// 生徒1人の現在のアクティブ月額合計
function studentMonthly(sid){
  return ALL_ENROLL.filter(function(e){return e.studentID===sid&&e.isActive;})
    .reduce(function(sum,e){return sum+effPrice(e);},0);
}

// 学年別の在籍・月額と、来年3月に卒業で抜ける売上のダッシュボード（現在の在籍ベース）
function buildGradePanel(){
  var active=ALL_STUDENTS.filter(function(s){return s.isActive;});
  if(!active.length)return '';
  var byGrade={};
  active.forEach(function(s){
    var g=GRADE_ORDER.indexOf(s.grade)>=0?s.grade:'未設定';
    if(!byGrade[g])byGrade[g]={count:0,monthly:0};
    byGrade[g].count++;
    byGrade[g].monthly+=studentMonthly(s.studentID);
  });
  var now=new Date();
  var gradYear=now.getMonth()+1>=4?now.getFullYear()+1:now.getFullYear();
  // 卒業で抜ける学年（中3=高校進学・高3=卒業）。小6は中学部へ進級提案できるため別扱い
  var exit={count:0,monthly:0};
  ['中3','高3'].forEach(function(g){if(byGrade[g]){exit.count+=byGrade[g].count;exit.monthly+=byGrade[g].monthly;}});
  var watch=byGrade['小6']||{count:0,monthly:0};
  var maxMonthly=1;
  GRADE_ORDER.concat(['未設定']).forEach(function(g){if(byGrade[g]&&byGrade[g].monthly>maxMonthly)maxMonthly=byGrade[g].monthly;});
  var rows='';
  GRADE_ORDER.concat(['未設定']).forEach(function(g){
    var d=byGrade[g];
    if(!d)return;
    var isExit=(g==='中3'||g==='高3'),isWatch=(g==='小6');
    var color=isExit?'var(--ng)':isWatch?'var(--accent)':'var(--ok)';
    rows+='<div class="course-bar-row"><span class="course-bar-label">'+esc(g)+' <span style="color:var(--muted);">'+d.count+'名</span></span>';
    rows+='<div class="course-bar-track"><div class="course-bar-fill" style="background:'+color+';width:'+Math.round(d.monthly/maxMonthly*100)+'%;"></div></div>';
    rows+='<span class="course-bar-val">¥'+d.monthly.toLocaleString()+'</span></div>';
  });
  var h='<div class="dash-chart-wrap"><div class="dash-chart-title">学年別在籍と卒業予測</div>'+rows;
  h+='<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;font-size:13px;line-height:1.7;">';
  h+='<div style="display:flex;justify-content:space-between;"><span>'+gradYear+'年3月末 卒業見込み（中3・高3）</span><span style="color:var(--ng);font-weight:700;">'+exit.count+'名 / ¥'+exit.monthly.toLocaleString()+'/月</span></div>';
  h+='<div style="display:flex;justify-content:space-between;"><span>そのまま抜けた場合の年間影響</span><span style="color:var(--ng);font-weight:700;">▲¥'+(exit.monthly*12).toLocaleString()+'</span></div>';
  if(watch.count)h+='<div style="display:flex;justify-content:space-between;"><span>小6（中学部への進級提案対象）</span><span style="color:var(--accent);font-weight:700;">'+watch.count+'名 / ¥'+watch.monthly.toLocaleString()+'/月</span></div>';
  h+='<div style="color:var(--muted);font-size:11px;margin-top:6px;">4月までに月額¥'+exit.monthly.toLocaleString()+'分（体験→入会）の獲得が必要です。低学年ほど在籍期間が長く、埋める価値が大きくなります。</div>';
  h+='</div></div>';
  return h;
}

// 平均月謝×平均在籍月数からLTV（生徒1人の生涯売上）と許容獲得コストを出す
function buildLtvPanel(){
  var active=ALL_STUDENTS.filter(function(s){return s.isActive;});
  if(!active.length)return '';
  var totalMonthly=0;
  active.forEach(function(s){totalMonthly+=studentMonthly(s.studentID);});
  var avgMonthly=Math.round(totalMonthly/active.length);
  // 在籍月数: 退会者（入会日と退会日が揃う人）の実績を優先。いなければ現役の平均在籍
  var leaverMonths=ALL_STUDENTS.filter(function(s){return s.leaveDate&&s.joinDate;}).map(function(s){
    var j=new Date(s.joinDate),l=new Date(s.leaveDate);
    return Math.max(1,(l.getFullYear()-j.getFullYear())*12+(l.getMonth()-j.getMonth()));
  });
  var activeMonths=active.map(function(s){return calcMonths(s.joinDate);});
  var avg=function(a){return a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):0;};
  var tenure=leaverMonths.length>=5?avg(leaverMonths):Math.max(avg(leaverMonths),avg(activeMonths));
  if(!tenure)return '';
  var ltv=avgMonthly*tenure;
  var basis=leaverMonths.length>=5?'退会者'+leaverMonths.length+'名の実績':'現役の平均在籍';
  var h='<div class="dash-chart-wrap"><div class="dash-chart-title">LTV（生徒1人の生涯売上）</div>';
  h+='<div class="kpi-grid" style="margin-bottom:10px;">';
  h+='<div class="kpi-card"><div class="kpi-label">推定LTV</div><div class="kpi-val" style="font-size:20px;">¥'+ltv.toLocaleString()+'</div><div class="kpi-sub">平均月謝 ¥'+avgMonthly.toLocaleString()+' × '+tenure+'ヶ月</div></div>';
  h+='<div class="kpi-card"><div class="kpi-label">許容獲得コスト</div><div class="kpi-val" style="font-size:20px;">¥'+Math.round(ltv*0.1).toLocaleString()+'</div><div class="kpi-sub">LTVの10%目安</div></div>';
  h+='</div>';
  h+='<div style="color:var(--muted);font-size:11px;line-height:1.6;">在籍月数は'+basis+'ベース。入会1人につき広告費・紹介特典・体験対応を合計¥'+Math.round(ltv*0.1).toLocaleString()+'（〜2割なら¥'+Math.round(ltv*0.2).toLocaleString()+'）まで掛けても回収できます。</div>';
  h+='</div>';
  return h;
}

/* ========== 今日やること・着地予測（概況・当月のみ） ========== */
// 今日やることサマリー: 未入金・体験生フォロー・今日の体験をチェックリスト表示
function renderDashTodo(yr,mo){
  var box=document.getElementById('dash-todo');
  if(!box)return;
  var today=todayStr();
  var items=[];
  // 体験生まわり（同期で出せるものから）
  var todays=ALL_TRIALS.filter(function(t){return t.status==='予定'&&t.trialDate===today;});
  var overdue=ALL_TRIALS.filter(function(t){return t.status==='予定'&&t.trialDate&&t.trialDate<today;});
  var pending=ALL_TRIALS.filter(function(t){return t.status==='済';});
  if(todays.length)items.push({icon:'🔔',label:'今日の体験',detail:todays.map(function(t){return t.name;}).join('・'),count:todays.length,onclick:"switchTab('trial')"});
  if(overdue.length)items.push({icon:'📝',label:'体験結果の記録待ち',detail:'体験日を過ぎています',count:overdue.length,onclick:"switchTab('trial')"});
  if(pending.length)items.push({icon:'🤝',label:'入会・見送りの判断待ち',detail:'体験済みのままの体験生',count:pending.length,onclick:"switchTab('trial')"});
  function draw(unpaidItem){
    var list=items.slice();
    if(unpaidItem)list.unshift(unpaidItem);
    if(!list.length){box.innerHTML='<div style="font-size:14px;color:var(--ok);padding:6px 0;">今日やることはありません 🎉</div>';return;}
    box.innerHTML=list.map(function(it){
      return '<div class="todo-row"'+(it.onclick?' onclick="'+it.onclick+'"':'')+'><span class="todo-ico">'+it.icon+'</span>'
        +'<span class="todo-body"><span class="todo-label">'+it.label+'</span><span class="todo-detail">'+esc(it.detail||'')+'</span></span>'
        +'<span class="todo-count">'+it.count+'件</span></div>';
    }).join('');
  }
  draw(null);
  fetchPayments(yr,mo).then(function(pay){
    if(dashViewYear!==yr||dashViewMonth!==mo)return;
    var monthEnrolls=enrollsForMonth(yr,mo);
    var unpaid=studentsForMonth(yr,mo).filter(function(s){return !pay[s.studentID];});
    var total=0;
    unpaid.forEach(function(s){total+=monthEnrolls.filter(function(e){return e.studentID===s.studentID;}).reduce(function(sum,e){return sum+effPrice(e);},0);});
    var unpaidItem=unpaid.length?{icon:'💰',label:mo+'月の未入金',detail:'合計 ¥'+total.toLocaleString()+'（下の一覧から督促文をコピーできます）',count:unpaid.length,onclick:"scrollToUnpaid()"}:null;
    draw(unpaidItem);
    renderDashForecast(yr,mo,pay);
  }).catch(function(){
    draw(null);
    var f=document.getElementById('dash-forecast');
    if(f)f.innerHTML='<div style="font-size:13px;color:var(--muted);">入金データを取得できませんでした</div>';
  });
}
function scrollToUnpaid(){
  var el=document.getElementById('dash-unpaid');
  if(el)el.closest('.dash-chart-wrap').scrollIntoView({behavior:'smooth',block:'start'});
}
// 今月の着地予測: 請求見込み・入金済み・残り未回収・目標比
function renderDashForecast(yr,mo,pay){
  var box=document.getElementById('dash-forecast');
  if(!box)return;
  var monthEnrolls=enrollsForMonth(yr,mo);
  var students=studentsForMonth(yr,mo);
  var expected=0,paidSum=0;
  students.forEach(function(s){
    var m=monthEnrolls.filter(function(e){return e.studentID===s.studentID;}).reduce(function(sum,e){return sum+effPrice(e);},0);
    expected+=m;
    if(pay[s.studentID])paidSum+=m;
  });
  var remain=expected-paidSum;
  var pct=expected>0?Math.round(paidSum/expected*100):0;
  var target=ALL_TARGETS[yr+'年'+mo+'月']||null;
  var h='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px;">';
  h+='<span style="font-size:24px;font-weight:700;color:var(--accent);">¥'+expected.toLocaleString()+'</span>';
  h+='<span style="font-size:12px;color:var(--muted);">このままの在籍で今月の請求見込み</span></div>';
  h+='<div class="course-bar-track" style="height:10px;margin-bottom:8px;"><div class="course-bar-fill" style="height:10px;background:var(--ok);width:'+pct+'%;"></div></div>';
  h+='<div style="display:flex;justify-content:space-between;font-size:13px;flex-wrap:wrap;gap:6px;">';
  h+='<span>入金済み <span style="color:var(--ok);font-weight:700;">¥'+paidSum.toLocaleString()+'</span>（'+pct+'%）</span>';
  h+='<span>残り <span style="color:'+(remain>0?'var(--ng)':'var(--ok)')+';font-weight:700;">¥'+remain.toLocaleString()+'</span></span></div>';
  if(target){
    var tp=Math.round(expected/target*100);
    h+='<div style="font-size:12px;color:var(--muted);margin-top:8px;">目標 ¥'+target.toLocaleString()+' に対して <span class="'+(tp>=100?'pos':'neg')+'" style="font-weight:700;">'+tp+'%</span></div>';
  }
  box.innerHTML=h;
}
// 未入金の督促メッセージを作ってコピー（LINEに貼るだけ）
function copyReminder(btn){
  var name=btn.dataset.name,amount=Number(btn.dataset.amount)||0,mo=btn.dataset.mo;
  var msg='【総合学習教室ブリッジ】\n'+name+'さん 保護者様\n\nいつもお世話になっております。\n'
    +mo+'月分のお月謝（¥'+amount.toLocaleString()+'）のご入金が、まだ確認できておりません。\n'
    +'お手数をおかけしますが、ご確認のほどよろしくお願いいたします。\n'
    +'※行き違いでお手続き済みの場合は、ご容赦ください。';
  function done(){showToast(name+'さんへの督促文をコピーしました。LINEに貼り付けてください','ok');}
  function fail(){showToast('コピーできませんでした','err');}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(msg).then(done).catch(function(){legacyCopy(msg)?done():fail();});
  }else{legacyCopy(msg)?done():fail();}
}
function legacyCopy(text){
  try{
    var ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    var ok=document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(e){return false;}
}

// 指定月の未入金生徒一覧を概況タブに描画する
function renderDashUnpaid(yr,mo){
  fetchPayments(yr,mo).then(function(pay){
    // 取得中に表示月が変わっていたら描画しない
    if(dashViewYear!==yr||dashViewMonth!==mo)return;
    var box=document.getElementById('dash-unpaid');
    if(!box)return;
    var unpaid=studentsForMonth(yr,mo).filter(function(s){return !pay[s.studentID];});
    unpaid.sort(byYomi);
    if(!unpaid.length){box.innerHTML='<div style="font-size:13px;color:var(--ok);padding:6px 0;">全員入金済みです</div>';return;}
    // 金額もその月時点の在籍コースで計算する（現在の在籍で計算すると過去月の金額がずれる）
    var monthEnrolls=enrollsForMonth(yr,mo);
    var total=0,rows='';
    unpaid.forEach(function(s){
      var monthly=monthEnrolls.filter(function(e){return e.studentID===s.studentID;}).reduce(function(sum,e){return sum+effPrice(e);},0);
      total+=monthly;
      rows+='<div class="uncoll-row"><span>'+esc(s.name)+(s.grade?'<span style="color:var(--muted);font-size:11px;margin-left:6px;">'+esc(s.grade)+'</span>':'')+'</span>';
      rows+='<span style="display:flex;align-items:center;gap:8px;"><span style="color:var(--ng);font-weight:700;">¥'+monthly.toLocaleString()+'</span>';
      rows+='<button class="btn btn-ghost btn-sm" data-name="'+esc(s.name)+'" data-amount="'+monthly+'" data-mo="'+mo+'" onclick="copyReminder(this)">📋 督促文</button></span></div>';
    });
    box.innerHTML='<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding-bottom:8px;border-bottom:1px solid var(--border);"><span>未入金 <span style="color:var(--ng);font-weight:700;">'+unpaid.length+'名</span></span><span>合計 <span style="color:var(--ng);font-weight:700;">¥'+total.toLocaleString()+'</span></span></div>'+rows
      +'<div style="font-size:11px;color:var(--muted);margin-top:8px;">先月分の未入金は毎週月曜に「未納管理」シートへ自動転記され、段階督促が始まります。</div>';
  }).catch(function(e){
    console.error('unpaid load',e);
    var box=document.getElementById('dash-unpaid');
    if(box)box.innerHTML='<div style="font-size:13px;color:var(--muted);">入金データを取得できませんでした</div>';
  });
}

function buildDashTrendChart(){
  var canvas=document.getElementById('dash-trend-canvas');
  if(!canvas||typeof Chart==='undefined')return;
  initDashMonth();
  var baseYr=dashViewYear,baseMo=dashViewMonth;
  var labels=[],joins=[],leaves=[];
  for(var i=5;i>=0;i--){
    var d=new Date(baseYr,baseMo-1-i,1);
    var dyr=d.getFullYear(),dmo=d.getMonth();
    labels.push((dmo+1)+'月');
    joins.push(ALL_STUDENTS.filter(function(s){if(!s.joinDate)return false;var jd=new Date(s.joinDate);return jd.getFullYear()===dyr&&jd.getMonth()===dmo;}).length);
    leaves.push(ALL_STUDENTS.filter(function(s){if(!s.leaveDate||s.isActive)return false;var ld=new Date(s.leaveDate);return ld.getFullYear()===dyr&&ld.getMonth()===dmo;}).length);
  }
  if(dashTrendChart){dashTrendChart.destroy();dashTrendChart=null;}
  dashTrendChart=new Chart(canvas,{
    type:'bar',
    data:{labels:labels,datasets:[
      {label:'入会',data:joins,backgroundColor:'rgba(63,185,80,0.7)',borderColor:'rgba(63,185,80,1)',borderWidth:1,borderRadius:3},
      {label:'退会',data:leaves,backgroundColor:'rgba(248,81,73,0.6)',borderColor:'rgba(248,81,73,1)',borderWidth:1,borderRadius:3}
    ]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#8b949e',font:{size:11}}},tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': '+ctx.raw+'名';}}}},scales:{y:{ticks:{color:'#8b949e',stepSize:1},grid:{color:'rgba(48,54,61,0.6)'},border:{display:false}},x:{ticks:{color:'#8b949e'},grid:{display:false}}}}
  });
}

function buildCourseDistChart() {
  const el = document.getElementById('course-dist');
  if (!el) return;

  // カテゴリ定義（どのパターンにも一致しないコースは「その他」へ）
  const CATS     = ['そろばん', '算数', '国語', '塾', 'その他'];
  const PATTERNS = [/そろばん/, /算数/, /国語/, /ブリッジ/];
  const COLORS   = ['#e8a84c', '#3fb950', '#58a6ff', '#f85149', '#8b949e'];

  // ALL_ENROLLからカテゴリ別合計を集計
  const totals = CATS.map(() => 0);
  ALL_ENROLL.filter(e => e.isActive).forEach(e => {
    const price = effPrice(e);
    if (!price) return;
    let idx = PATTERNS.findIndex(p => p.test(e.courseName || ''));
    if (idx < 0) idx = CATS.length - 1;
    totals[idx] += price;
  });

  const grand = totals.reduce((s, v) => s + v, 0);
  const maxV  = Math.max(...totals, 1);

  // HTML描画：左にドーナツ、右にカテゴリバー
  el.innerHTML = `
    <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;">
      <div style="position:relative;flex-shrink:0;">
        <canvas id="cat-donut" width="150" height="150"></canvas>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;">
          <div style="font-size:.65rem;color:var(--muted);">合計</div>
          <div style="font-size:.9rem;font-weight:700;color:var(--text);">¥${grand.toLocaleString()}</div>
        </div>
      </div>
      <div style="flex:1;min-width:160px;">
        ${CATS.map((cat, i) => {
          if (cat === 'その他' && !totals[i]) return '';
          const pct = grand > 0 ? Math.round(totals[i] / grand * 100) : 0;
          const bar = Math.round(totals[i] / maxV * 100);
          return `<div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
              <span style="font-weight:600;color:${COLORS[i]};font-size:.9rem;">${cat}</span>
              <span style="font-size:.85rem;">¥${totals[i].toLocaleString()}
                <span style="color:${COLORS[i]};font-size:.8rem;margin-left:4px;">(${pct}%)</span>
              </span>
            </div>
            <div style="background:rgba(255,255,255,0.07);border-radius:6px;height:9px;overflow:hidden;">
              <div style="background:${COLORS[i]};border-radius:6px;height:9px;width:${bar}%;transition:width .5s;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  // Chart.jsでドーナツチャートを描画（%ラベル付き）
  const ctx = document.getElementById('cat-donut');
  if (ctx && window.Chart) {
    if (window._catDonutChart) { window._catDonutChart.destroy(); }
    const pctLabelPlugin = {
      id: 'pctLabel',
      afterDatasetDraw(chart) {
        const { ctx: c, data } = chart;
        const dataset = data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        const total = dataset.data.reduce((s, v) => s + v, 0);
        if (!total) return;
        c.save();
        meta.data.forEach((arc, i) => {
          const val = dataset.data[i];
          const pct = Math.round(val / total * 100);
          if (pct < 5) return;
          const angle = (arc.startAngle + arc.endAngle) / 2;
          const r = (arc.innerRadius + arc.outerRadius) / 2;
          const x = arc.x + Math.cos(angle) * r;
          const y = arc.y + Math.sin(angle) * r;
          c.fillStyle = '#fff';
          c.font = 'bold 10px "Noto Sans JP", sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.shadowColor = 'rgba(0,0,0,0.5)';
          c.shadowBlur = 3;
          c.fillText(pct + '%', x, y);
          c.shadowBlur = 0;
        });
        c.restore();
      }
    };
    window._catDonutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: CATS,
        datasets: [{
          data: totals,
          backgroundColor: COLORS,
          borderColor: '#0d1117',
          borderWidth: 3
        }]
      },
      options: {
        responsive: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                const v = ctx.parsed;
                const p = grand > 0 ? Math.round(v / grand * 100) : 0;
                return ' ¥' + v.toLocaleString() + ' (' + p + '%)';
              }
            }
          }
        },
        cutout: '60%'
      },
      plugins: [pctLabelPlugin]
    });
  }
}
function filterTrials(btn){
  trialFilter=btn.dataset.status;
  document.querySelectorAll('#trial-filter-tabs .ctab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  renderTrials();
}

function renderTrials(){
  var list=trialFilter==='all'?ALL_TRIALS:ALL_TRIALS.filter(function(t){return t.status===trialFilter;});
  list=list.slice().sort(function(a,b){return (b.trialDate||'').localeCompare(a.trialDate||'');});
  var el=document.getElementById('trial-list');
  if(!el)return;
  if(!list.length){el.innerHTML='<div class="empty">該当する体験生がいません</div>';return;}
  var statusBadge={
    '予定':'<span class="sbadge sb-plan">体験予定</span>',
    '済':'<span class="sbadge sb-done">体験済</span>',
    '入会':'<span class="sbadge sb-join">入会済</span>',
    '見送り':'<span class="sbadge sb-pass">見送り</span>'
  };
  var h='';
  list.forEach(function(t){
    var badge=statusBadge[t.status]||'<span class="sbadge sb-pass">'+esc(t.status||'未設定')+'</span>';
    h+='<div class="tcard">';
    h+='<div class="t-head"><div><div class="t-name">'+esc(t.name)+'　'+badge+'</div>';
    h+='<div class="t-meta">'+esc(t.grade||'--')+(t.school?' / '+esc(t.school):'')+(t.trialDate?'　体験日: '+esc(t.trialDate):'')+'<br>'+(t.contact?'連絡先: '+esc(t.contact):'')+(t.memo?'　'+esc(t.memo):'')+'</div></div></div>';
    h+='<div class="t-actions">';
    if(t.status!=='入会'&&t.status!=='見送り'){
      h+='<button class="btn btn-ghost btn-sm" data-tid="'+esc(t.trialID)+'" data-status="済" onclick="updateTrialStatus(this)">体験完了</button>';
    }
    if(t.status==='済'||t.status==='予定'){
      h+='<button class="btn btn-primary btn-sm" data-tid="'+esc(t.trialID)+'" data-name="'+esc(t.name)+'" onclick="convertTrialBtn(this)">入会へ</button>';
    }
    if(t.status!=='入会'){
      h+='<button class="btn btn-ghost btn-sm" data-tid="'+esc(t.trialID)+'" data-status="見送り" onclick="updateTrialStatus(this)">見送り</button>';
    }
    h+='</div></div>';
  });
  el.innerHTML=h;
}

function openAddTrialModal(){
  document.getElementById('tr-name').value='';document.getElementById('tr-grade').value='';
  document.getElementById('tr-school').value='';document.getElementById('tr-contact').value='';
  document.getElementById('tr-date').value=todayStr();
  document.getElementById('tr-memo').value='';
  document.getElementById('trial-modal').classList.remove('hide');
}

async function submitTrial(){
  var name=document.getElementById('tr-name').value.trim();
  if(!name){showToast('氏名を入力してください','err');return;}
  var btn=document.getElementById('trial-submit-btn');btn.disabled=true;btn.textContent='追加中...';
  try{
    var p={name:name,grade:document.getElementById('tr-grade').value,school:document.getElementById('tr-school').value.trim(),contact:document.getElementById('tr-contact').value.trim(),trialDate:document.getElementById('tr-date').value,memo:document.getElementById('tr-memo').value.trim(),status:'予定'};
    var r=await gas('addTrial',p);
    if(r.status!=='ok')throw new Error(r.message||'追加に失敗しました');
    ALL_TRIALS.unshift(Object.assign({trialID:r.trialID},p));
    if(p.trialDate) gas('createCalendarEvent',Object.assign({name:name},p)).catch(function(){});
    showToast(name+' を追加しました','ok');closeModal('trial-modal');renderTrials();
  }catch(e){showToast('エラー: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='追加する';}
}

async function updateTrialStatus(btn){
  var tid=btn.dataset.tid,status=btn.dataset.status;
  try{
    var r=await gas('updateTrialStatus',{trialID:tid,status:status});
    if(r.status!=='ok')throw new Error(r.message||'更新に失敗しました');
    ALL_TRIALS.forEach(function(t){if(t.trialID===tid)t.status=status;});
    renderTrials();showToast('ステータスを更新しました','ok');
  }catch(e){showToast('エラー: '+e.message,'err');}
}

function convertTrialBtn(btn){
  _convertCtx={tid:btn.dataset.tid,name:btn.dataset.name};
  document.getElementById('convert-modal-title').textContent=btn.dataset.name+' の入会処理';
  document.getElementById('convert-modal-msg').textContent=btn.dataset.name+' を正式入会に変換します。学年・学校・連絡先・メモは体験生の情報を引き継ぎます。';
  document.getElementById('convert-yomi').value='';
  document.getElementById('convert-join-date').value=todayStr();
  document.getElementById('convert-confirm-btn').onclick=confirmConvert;
  document.getElementById('convert-modal').classList.remove('hide');
}

async function confirmConvert(){
  // 入会時にも「よみ」を必ず入れる（五十音順の並びから漏れる生徒を作らない）
  var yomi=document.getElementById('convert-yomi').value.trim();
  if(!yomi){showToast('「よみ」を入力してください（五十音順の並びに使います）','err');document.getElementById('convert-yomi').focus();return;}
  var btn=document.getElementById('convert-confirm-btn');btn.disabled=true;btn.textContent='処理中...';
  try{
    var trial=null;ALL_TRIALS.forEach(function(t){if(t.trialID===_convertCtx.tid)trial=t;});
    var joinDate=document.getElementById('convert-join-date').value||todayStr();
    // 体験時のメモに体験日も残しておく（いつ体験して入会したかが後から追える）
    var memo=(trial&&trial.memo?trial.memo:'')+(trial&&trial.trialDate?(trial.memo?' / ':'')+'体験日:'+trial.trialDate:'');
    var p={name:_convertCtx.name,yomi:yomi,grade:trial?trial.grade:'',school:trial?trial.school:'',phone:trial?trial.contact:'',lineId:'',joinDate:joinDate,memo:memo};
    var r=await gas('addStudent',p);
    if(r.status!=='ok')throw new Error(r.message);
    await gas('updateTrialStatus',{trialID:_convertCtx.tid,status:'入会'});
    ALL_TRIALS.forEach(function(t){if(t.trialID===_convertCtx.tid)t.status='入会';});
    showToast(_convertCtx.name+' を生徒に登録しました','ok');
    closeModal('convert-modal');renderTrials();
    await loadStudents();
    switchTab('mgr');
    loadPaymentForCurrentMonth(); // タブボタン経由でないと入金状況が読まれずチェックが全て空になる
    // そのままコース選択に進めるようコース追加モーダルを開く
    if(r.studentID)openAddModal(r.studentID,_convertCtx.name);
  }catch(e){showToast('エラー: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='入会処理する';}
}

/* ========== STUDENT MODALS ========== */
function editPriceBtn(btn){
  _priceCtx={eid:btn.dataset.eid,cn:btn.dataset.cn,sid:btn.dataset.sid};
  document.getElementById('price-modal-title').textContent='「'+btn.dataset.cn+'」月額変更';
  document.getElementById('price-modal-label').textContent='現在: ¥'+Number(btn.dataset.p).toLocaleString();
  document.getElementById('price-input').value=btn.dataset.p;
  document.getElementById('price-modal').classList.remove('hide');
  document.getElementById('price-confirm-btn').onclick=confirmPriceEdit;
}
async function confirmPriceEdit(){
  var v=document.getElementById('price-input').value.trim();
  var np=v===''?'':parseInt(v.replace(/\D/g,''),10);
  if(np!==''&&isNaN(np)){showToast('金額は数値で入力してください','err');return;}
  var btn=document.getElementById('price-confirm-btn');btn.disabled=true;btn.textContent='更新中...';
  try{
    var r=await gas('updateEnrollment',{enrollID:_priceCtx.eid,overridePrice:np});
    if(r.status!=='ok')throw new Error(r.message);
    showToast('月額を更新しました','ok');closeModal('price-modal');
    await loadStudents();var el=document.getElementById('sd-'+_priceCtx.sid);if(el)el.classList.add('open');
  }catch(e){showToast('エラー: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='変更する';}
}

function endEnrollBtn(btn){
  _endCtx={eid:btn.dataset.eid,sid:btn.dataset.sid,cn:btn.dataset.cn};
  document.getElementById('end-modal-msg').textContent='「'+btn.dataset.cn+'」を終了しますか？';
  document.getElementById('end-modal').classList.remove('hide');
  document.getElementById('end-confirm-btn').onclick=confirmEndEnroll;
}
async function confirmEndEnroll(){
  var btn=document.getElementById('end-confirm-btn');btn.disabled=true;btn.textContent='処理中...';
  try{
    var r=await gas('endEnrollment',{enrollID:_endCtx.eid});
    if(r.status!=='ok')throw new Error(r.message);
    showToast('コースを終了しました','ok');closeModal('end-modal');
    await loadStudents();var el=document.getElementById('sd-'+_endCtx.sid);if(el)el.classList.add('open');
  }catch(e){showToast('エラー: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='終了する';}
}

function doWithdrawBtn(btn){
  _withdrawCtx={sid:btn.dataset.sid,name:btn.dataset.name};
  document.getElementById('withdraw-modal-msg').textContent=btn.dataset.name+' を退会処理しますか？スプレッドシートのデータは残ります。';
  document.getElementById('withdraw-date').value=todayStr();
  document.getElementById('withdraw-reason').value='';
  document.getElementById('withdraw-modal').classList.remove('hide');
  document.getElementById('withdraw-confirm-btn').onclick=confirmWithdraw;
}
async function confirmWithdraw(){
  var btn=document.getElementById('withdraw-confirm-btn');btn.disabled=true;btn.textContent='処理中...';
  try{
    var ld=document.getElementById('withdraw-date').value;
    var reason=document.getElementById('withdraw-reason').value;
    var r=await gas('withdraw',{studentID:_withdrawCtx.sid,leaveDate:ld||'',reason:reason});
    if(r.status!=='ok')throw new Error(r.message);
    showToast(_withdrawCtx.name+' を退会処理しました','ok');closeModal('withdraw-modal');loadStudents();
  }catch(e){showToast('エラー: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='退会処理する';}
}

function openAddModalBtn(btn){openAddModal(btn.dataset.sid,btn.dataset.name);}
function openAddModal(sid,name){
  addTargetID=sid;addTargetName=name;addSel=[];
  document.getElementById('add-modal-title').textContent=addTargetName+' にコース追加';
  document.getElementById('add-stags').innerHTML='';
  buildCtabs('add-ctabs','add-cgrid','add');
  document.getElementById('add-btn').onclick=confirmAdd;
  document.getElementById('add-modal').classList.remove('hide');
}
async function confirmAdd(){
  if(!addSel.length){showToast('コースを選んでください','err');return;}
  var btn=document.getElementById('add-btn');btn.disabled=true;btn.textContent='追加中...';
  try{
    var today=todayStr();
    for(var i=0;i<addSel.length;i++){
      var c=addSel[i];
      await gas('addEnrollment',{studentID:addTargetID,studentName:addTargetName,courseID:c.courseID,courseName:c.courseName||c.displayName||c.courseID,standardPrice:c.price||0,startDate:today});
    }
    showToast('コースを追加しました','ok');closeModal('add-modal');
    await loadStudents();var el=document.getElementById('sd-'+addTargetID);if(el)el.classList.add('open');
  }catch(e){showToast('エラー: '+e.message,'err');}
  finally{btn.disabled=false;btn.textContent='追加する';}
}

function closeModal(id){document.getElementById(id).classList.add('hide');}

/* ========== SALES ========== */
// 目標の共有先（自動化WebアプリのシートAPI ?app=targets）。未設定ならlocalStorageのみで動く
function targetsApiUrl(){
  try{return localStorage.getItem('bridge_webapp_url')||'';}catch(e){return '';}
}
function targetsApi(params){
  var base=targetsApiUrl();
  if(!base)return Promise.reject(new Error('共有未設定'));
  var qs=Object.keys(params).map(function(k){return k+'='+encodeURIComponent(params[k]);}).join('&');
  return fetch(base+'?app=targets&'+qs).then(function(r){return r.json();});
}
// 「☁ 共有」ボタン: WebアプリURLを1回貼るだけで、目標がシート保存になり全端末で揃う
function setupTargetsSync(){
  var v=prompt('売上目標を全端末で共有します。\n体験フォームなどWebアプリのURL（?app=trial 等）を貼ってください。?以降は自動で外します。\n空にして保存すると共有を解除します。',targetsApiUrl());
  if(v===null)return;
  v=v.trim().replace(/\?.*$/,'');
  try{localStorage.setItem('bridge_webapp_url',v);}catch(e){}
  if(v){showToast('共有設定を保存しました','ok');loadTargets();}
  else{showToast('共有を解除しました','ok');}
}
function loadTargets(){
  try{var s=localStorage.getItem('bridge_targets');ALL_TARGETS=s?JSON.parse(s):{};} catch(e){ALL_TARGETS={};}
  // シート保存の目標があれば取り込んで全端末で共有する（共有未設定ならlocalStorageで動き続ける）
  targetsApi({}).then(function(r){
    if(r.status==='ok'&&r.targets){
      ALL_TARGETS=Object.assign({},ALL_TARGETS,r.targets);
      try{localStorage.setItem('bridge_targets',JSON.stringify(ALL_TARGETS));}catch(e){}
      if(document.getElementById('pane-sales').classList.contains('active')&&salesYear)renderSalesMonths();
    }
  }).catch(function(){});
}
function saveTarget(){
  var v=document.getElementById('target-input').value.trim();
  var amount=parseInt(v.replace(/\D/g,''));
  if(!salesMonth||isNaN(amount)){showToast('月と金額を確認してください','err');return;}
  ALL_TARGETS[salesMonth]=amount;
  try{localStorage.setItem('bridge_targets',JSON.stringify(ALL_TARGETS));}catch(e){}
  // 共有設定済みならシートにも保存
  targetsApi({action:'save',month:salesMonth,amount:amount}).then(function(r){
    if(r.status!=='ok')showToast('共有保存に失敗: '+(r.message||''),'err');
  }).catch(function(){});
  showToast(salesMonth+' の目標を保存しました','ok');
  renderChart();renderSalesDetail();
}

async function loadSales(){
  if(salesLoading)return;salesLoading=true;
  document.getElementById('s-content').innerHTML='<div class="loading">読込中...</div>';
  try{
    var r=await gas('getSales');
    if(r.status!=='ok')throw new Error(r.message);
    ALL_SALES=Object.assign({},HISTORICAL_SALES,r.sales||{});buildSalesUI();
  }catch(e){ALL_SALES=Object.assign({},HISTORICAL_SALES);buildSalesUI();showToast('売上データの取得に失敗しました（過去データのみ表示）','err');}
  finally{salesLoading=false;}
}

function buildSalesUI(){
  var now=new Date();
  var yr=now.getMonth()===0?now.getFullYear()-1:now.getFullYear();
  var dataYears=[];
  Object.keys(ALL_SALES).forEach(function(k){var m=k.match(/^(\d{4})年/);if(m&&dataYears.indexOf(parseInt(m[1]))<0)dataYears.push(parseInt(m[1]));});
  var allYears=dataYears.slice();
  [yr-1,yr,yr+1].forEach(function(y){if(allYears.indexOf(y)<0)allYears.push(y);});
  allYears.sort();
  if(!salesYear)salesYear=String(yr);
  document.getElementById('s-years').innerHTML=allYears.map(function(y){return '<button class="ybtn'+(y==salesYear?' active':'')+'" onclick="selYear(\''+y+'\')">'+y+'年度</button>';}).join('');
  renderSalesMonths();
}

function selYear(y){
  salesYear=y;salesMonth='';
  document.querySelectorAll('.ybtn').forEach(function(b){b.classList.toggle('active',b.textContent===y+'年度');});
  renderSalesMonths();
}

function setSalesMode(btn){
  salesMode=btn.dataset.mode;
  document.querySelectorAll('.mmode').forEach(function(b){b.classList.toggle('active',b.dataset.mode===salesMode);});
  renderChart();
}

function renderSalesMonths(){
  var yr=parseInt(salesYear),now=new Date();
  var keys=fiscalKeys(yr);
  if(!salesMonth){var l=null;for(var i=keys.length-1;i>=0;i--){if(ALL_SALES[keys[i]]){l=keys[i];break;}}salesMonth=l||keys[keys.length-1];}
  document.getElementById('s-months').innerHTML=keys.map(function(key){
    var p=key.match(/^(\d{4})年(\d+)月/);
    var isFuture=p&&new Date(parseInt(p[1]),parseInt(p[2])-1,2)>now;
    var label=key.replace(/^\d{4}年/,'');
    return '<button class="mbtn'+(key===salesMonth?' active':'')+(isFuture&&!ALL_SALES[key]?' future':'')+'" onclick="selMonth(\''+key+'\')">'+label+(isFuture&&!ALL_SALES[key]?'*':'')+'</button>';
  }).join('');
  // update target input
  var tgt=ALL_TARGETS[salesMonth];
  document.getElementById('target-input').value=tgt?tgt.toLocaleString():'';
  document.getElementById('target-month-lbl').textContent=(salesMonth?salesMonth.replace(/^\d{4}年/,''):'--')+' 目標:';
  renderChart();renderSalesDetail();
}

function selMonth(key){
  salesMonth=key;
  var label=key.replace(/^\d{4}年/,'');
  document.querySelectorAll('.mbtn').forEach(function(b){b.classList.toggle('active',b.textContent===label||b.textContent===label+'*');});
  var tgt=ALL_TARGETS[salesMonth];
  document.getElementById('target-input').value=tgt?tgt.toLocaleString():'';
  document.getElementById('target-month-lbl').textContent=label+' 目標:';
  renderSalesDetail();
}

function renderChart(){
  var canvas=document.getElementById('sales-chart');
  if(!canvas||typeof Chart==='undefined')return;
  var yr=parseInt(salesYear),now=new Date();
  var keys=fiscalKeys(yr);
  var labels=keys.map(function(k){return k.replace(/^\d{4}年/,'');});
  var active=ALL_ENROLL.filter(function(e){return e.isActive;});
  var enrollTotal=active.reduce(function(s,e){return s+(effPrice(e));},0);

  var billingData=keys.map(function(k){return (ALL_SALES[k]&&ALL_SALES[k].total>0)?ALL_SALES[k].total:0;});
  var actualData=keys.map(function(k){return (ALL_SALES[k]&&ALL_SALES[k].actual>0)?ALL_SALES[k].actual:0;});
  keys.forEach(function(k,i){var p=k.match(/^(\d{4})年(\d+)月/);var isFuture=p&&new Date(parseInt(p[1]),parseInt(p[2])-1,2)>now;if(isFuture&&billingData[i]===0)billingData[i]=enrollTotal;});

  var billingColors=keys.map(function(k){var p=k.match(/^(\d{4})年(\d+)月/);return (p&&new Date(parseInt(p[1]),parseInt(p[2])-1,2)>now)?'rgba(232,168,76,0.25)':'rgba(232,168,76,0.8)';});
  var datasets=[
    {label:'請求合計',data:billingData,backgroundColor:billingColors,borderColor:'rgba(232,168,76,1)',borderWidth:1,borderRadius:4,order:3},
    {label:'実績合計',data:actualData,backgroundColor:'rgba(63,185,80,0.7)',borderColor:'rgba(63,185,80,1)',borderWidth:1,borderRadius:4,order:2}
  ];

  // 目標ライン
  var targetData=keys.map(function(k){return ALL_TARGETS[k]||null;});
  if(targetData.some(function(v){return v!==null;})){
    datasets.push({label:'目標',data:targetData,type:'line',borderColor:'rgba(240,201,122,0.8)',borderDash:[4,4],borderWidth:2,pointRadius:3,pointBackgroundColor:'rgba(240,201,122,0.8)',fill:false,order:0,tension:0});
  }

  if(salesMode==='yoy'){
    var prevKeys=fiscalKeys(yr-1);
    var prevData=prevKeys.map(function(k){return (ALL_SALES[k]&&ALL_SALES[k].total>0)?ALL_SALES[k].total:null;});
    datasets.push({label:'前年同月',data:prevData,backgroundColor:'rgba(139,148,158,0.4)',borderColor:'rgba(139,148,158,0.8)',borderWidth:1,borderRadius:4,order:4});
  }

  if(salesMode==='avg'){
    var avgData=computeAvgData(yr,keys);
    if(avgData){
      datasets.push({label:'過去平均',data:avgData,type:'line',borderColor:'rgba(100,160,255,0.8)',borderDash:[6,3],borderWidth:2,pointRadius:2,fill:false,order:1,tension:0.3});
    }
  }

  canvas.style.display='block';
  if(salesChartObj){salesChartObj.destroy();salesChartObj=null;}
  salesChartObj=new Chart(canvas,{
    type:'bar',data:{labels:labels,datasets:datasets},
    options:{responsive:true,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:11}}},
        tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': ¥'+Number(ctx.raw||0).toLocaleString();}}}},
      scales:{y:{ticks:{color:'#8b949e',callback:function(v){return v>=10000?(v/10000).toFixed(0)+'万':'¥'+v;}},grid:{color:'rgba(48,54,61,0.6)'},border:{display:false}},x:{ticks:{color:'#8b949e'},grid:{display:false}}}}
  });
}

function computeAvgData(currentYr,currentKeys){
  var fiscalYears=[];
  Object.keys(ALL_SALES).forEach(function(k){
    var m=k.match(/^(\d{4})年(\d+)月/);
    if(m){var yr2=parseInt(m[1]),mo=parseInt(m[2]);var fy=mo===1?yr2-1:yr2;if(fy!==currentYr&&fiscalYears.indexOf(fy)<0)fiscalYears.push(fy);}
  });
  if(!fiscalYears.length)return null;
  return currentKeys.map(function(key,pos){
    var vals=[];
    fiscalYears.forEach(function(fy){
      var pk=fiscalKeys(fy)[pos];
      if(ALL_SALES[pk]&&ALL_SALES[pk].total>0)vals.push(ALL_SALES[pk].total);
    });
    return vals.length?Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length):null;
  });
}

function renderSalesDetail(){
  var c=document.getElementById('s-content');
  if(!salesMonth){c.innerHTML='<div class="empty">月を選んでください</div>';return;}
  var p=salesMonth.match(/^(\d{4})年(\d+)月/);
  var isFuture=p&&new Date(parseInt(p[1]),parseInt(p[2])-1,2)>new Date();
  var salesData=ALL_SALES[salesMonth]||null;
  var active=ALL_ENROLL.filter(function(e){return e.isActive;});
  var enrollTotal=active.reduce(function(s,e){return s+(effPrice(e));},0);
  var uids=[];active.forEach(function(e){if(uids.indexOf(e.studentID)<0)uids.push(e.studentID);});
  var target=ALL_TARGETS[salesMonth]||null;
  var h='';
  if(salesData&&salesData.total>0){
    var pctActual=salesData.total>0?Math.round((salesData.actual||0)/salesData.total*100):0;
    var pctTarget=target?Math.round(salesData.total/target*100):null;
    h+='<div class="sum-grid">';
    h+='<div class="sum-card"><div class="sum-label">請求合計（実績）</div><div class="sum-val">¥'+salesData.total.toLocaleString()+'</div>'+(pctTarget!=null?'<div class="kpi-sub">目標比 <span class="'+(pctTarget>=100?'pos':'neg')+'">'+pctTarget+'%</span></div>':'')+'</div>';
    h+='<div class="sum-card"><div class="sum-label">入金合計</div><div class="sum-val" style="color:var(--ok)">¥'+(salesData.actual||0).toLocaleString()+'</div><div class="kpi-sub">回収率 <span class="'+(pctActual>=100?'pos':'neg')+'">'+pctActual+'%</span></div></div>';
    h+='</div>';
    if(salesMode==='yoy'){
      // 前年キーは選択月自身の年から-1する（1月は「年度+1年1月」のため年度基準の置換では自分自身と比較してしまう）
      var prevKey2=p?(parseInt(p[1])-1)+'年'+p[2]+'月':'';
      var prevData2=ALL_SALES[prevKey2];
      if(prevData2&&prevData2.total>0){
        var diff=salesData.total-prevData2.total;
        var diffPct=Math.round(diff/prevData2.total*100);
        h+='<div style="background:rgba(139,148,158,.08);border:1px solid rgba(139,148,158,.25);border-radius:10px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">';
        h+='<div><div style="font-size:11px;color:var(--muted);">前年同月 ('+esc(prevKey2)+')</div><div style="font-size:16px;font-weight:700;">¥'+prevData2.total.toLocaleString()+'</div></div>';
        h+='<div style="text-align:right;"><div style="font-size:22px;font-weight:700;color:'+(diff>=0?'var(--ok)':'var(--ng)')+';">'+(diff>=0?'+':'')+diff.toLocaleString()+'</div><div style="font-size:12px;color:var(--muted);">'+(diff>=0?'+':'')+diffPct+'%</div></div></div>';
      }
    }
  }else{
    var pctTarget2=target?Math.round(enrollTotal/target*100):null;
    h+='<div class="sum-grid">';
    h+='<div class="sum-card"><div class="sum-label">'+(isFuture?'見込み月額':'在籍月額合計')+'</div><div class="sum-val">¥'+enrollTotal.toLocaleString()+'</div>'+(pctTarget2!=null?'<div class="kpi-sub">目標比 <span class="'+(pctTarget2>=100?'pos':'neg')+'">'+pctTarget2+'%</span></div>':'')+'</div>';
    h+='<div class="sum-card"><div class="sum-label">在籍生徒数</div><div class="sum-val">'+uids.length+'名</div></div>';
    h+='</div>';
    if(isFuture)h+='<div style="background:rgba(232,168,76,.08);border:1px solid rgba(232,168,76,.3);border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;color:var(--accent2);">この月はまだ実績データがありません。現在の在籍月額を表示しています。</div>';
  }
  if(target){
    h+='<div style="background:rgba(240,201,122,.08);border:1px solid rgba(240,201,122,.25);border-radius:10px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">';
    h+='<span style="font-size:13px;color:var(--muted);">月次目標</span><span style="font-size:16px;font-weight:700;color:var(--accent2);">¥'+target.toLocaleString()+'</span></div>';
  }
  h+='<div class="stitle">在籍コース一覧（月謝詳細）</div>';
  if(active.length){
    var byS={};
    active.forEach(function(e){if(!byS[e.studentID]){var st=ALL_STUDENTS.find(function(s){return s.studentID===e.studentID;})||{};byS[e.studentID]={name:e.studentName,yomi:st.yomi||'',courses:[]};}byS[e.studentID].courses.push(e);});
    var sids=Object.keys(byS).sort(function(a,b){return byYomi(byS[a],byS[b]);});
    h+='<table class="stbl"><thead><tr><th>氏名</th><th>コース</th><th style="text-align:right">月謝</th></tr></thead><tbody>';
    sids.forEach(function(sid){
      var s=byS[sid];
      var sub=s.courses.reduce(function(sum,e){return sum+(effPrice(e));},0);
      s.courses.forEach(function(e,i){
        var price=effPrice(e);
        h+='<tr>';
        if(i===0)h+='<td rowspan="'+s.courses.length+'" style="font-weight:700;vertical-align:top;">'+esc(s.name)+'</td>';
        h+='<td>'+esc(e.courseName||e.courseID)+(hasOverride(e)?'<span style="font-size:10px;color:var(--accent);margin-left:4px;">上書</span>':'')+'</td>';
        h+='<td class="td-r">¥'+price.toLocaleString()+'</td></tr>';
      });
      if(s.courses.length>1)h+='<tr><td></td><td style="font-size:11px;color:var(--muted);">小計</td><td class="td-r" style="color:var(--accent2);">¥'+sub.toLocaleString()+'</td></tr>';
    });
    h+='</tbody></table>';
  }else{h+='<div class="empty">在籍データなし</div>';}
  c.innerHTML=h;
}

/* ========== 料金改定シミュレーター ========== */
// 現在の在籍月額をもとに、値上げ率と想定退会数から改定後の売上を試算する
function renderPriceSim(){
  var box=document.getElementById('sim-result');
  if(!box)return;
  var active=ALL_ENROLL.filter(function(e){return e.isActive;});
  if(!active.length){box.innerHTML='<div style="font-size:13px;color:var(--muted);">生徒データの読み込み後に表示されます</div>';return;}
  var rate=parseFloat((document.getElementById('sim-rate').value||'').replace(/[^\d.\-]/g,''))||0;
  var churn=parseInt((document.getElementById('sim-churn').value||'').replace(/\D/g,''),10)||0;
  var total=active.reduce(function(s,e){return s+effPrice(e);},0);
  var uids=[];active.forEach(function(e){if(uids.indexOf(e.studentID)<0)uids.push(e.studentID);});
  var students=uids.length||1;
  var newAvg=(total/students)*(1+rate/100);
  var newTotal=Math.round(total*(1+rate/100)-Math.min(churn,students)*newAvg);
  var diff=newTotal-total;
  // 値上げ分が退会で相殺される損益分岐（この人数までなら改定後も現状を上回る）
  var breakEven=newAvg>0?Math.floor(total*(rate/100)/newAvg):0;
  var h='<div class="sum-grid" style="margin-top:4px;">';
  h+='<div class="sum-card"><div class="sum-label">現在の月額合計</div><div class="sum-val" style="font-size:18px;">¥'+total.toLocaleString()+'</div><div class="kpi-sub">'+students+'名在籍</div></div>';
  h+='<div class="sum-card"><div class="sum-label">改定後（退会'+churn+'名込み）</div><div class="sum-val" style="font-size:18px;color:'+(diff>=0?'var(--ok)':'var(--ng)')+';">¥'+newTotal.toLocaleString()+'</div><div class="kpi-sub">月 '+(diff>=0?'+':'')+diff.toLocaleString()+'円</div></div>';
  h+='</div>';
  h+='<div style="font-size:13px;line-height:1.8;">';
  h+='<div style="display:flex;justify-content:space-between;"><span>年間の増減</span><span style="font-weight:700;color:'+(diff>=0?'var(--ok)':'var(--ng)')+';">'+(diff>=0?'+':'')+(diff*12).toLocaleString()+'円</span></div>';
  h+='<div style="display:flex;justify-content:space-between;"><span>損益分岐（許容できる退会数）</span><span style="font-weight:700;color:var(--accent);">'+breakEven+'名まで</span></div>';
  h+='</div>';
  h+='<div style="color:var(--muted);font-size:11px;margin-top:8px;line-height:1.6;">全コース一律で試算しています。実際の改定は100円単位に丸め、在籍生は据え置き・新規から適用などの経過措置も検討してください。個別の金額変更は生徒タブの「変更」から行えます。</div>';
  box.innerHTML=h;
}

function showToast(msg,type){
  var el=document.getElementById('toast');
  el.textContent=msg;el.className='toast '+(type||'')+' show';
  clearTimeout(el._t);el._t=setTimeout(function(){el.classList.remove('show');},3500);
}

/* ========== PAYMENTS ========== */
var _payCache={};
// 指定月の入金状況 {studentID: boolean} を返す（キャッシュ付き、force=trueで再取得）
function fetchPayments(y,m,force){
  var key=y+'-'+m;
  if(!force&&_payCache[key])return Promise.resolve(_payCache[key]);
  return gas('getPaymentData',{year:y,month:m}).then(function(data){
    // エラー応答のまま空マップをキャッシュすると「全員未入金」と誤表示されるため弾く
    if(!data||(data.status&&data.status!=='ok'))throw new Error((data&&data.message)||'入金データの取得に失敗しました');
    var map={};
    // p.paidをbooleanに正規化（GASが"TRUE"/"FALSE"文字列を返す場合も対応）
    (data.payments||[]).forEach(function(p){
      var paidVal=p.paid;
      if(typeof paidVal==='string'){paidVal=(paidVal.toUpperCase()==='TRUE');}
      else{paidVal=!!paidVal;}
      map[p.studentID]=paidVal;
    });
    _payCache[key]=map;
    return map;
  });
}
function _initPayMonth(){
  if(!window._payYear){var now=new Date();window._payYear=now.getFullYear();window._payMonth=now.getMonth()+1;}
}
function _updatePayLabel(){
  var el=document.getElementById('pay-month-label');
  if(el) el.textContent=window._payYear+'年'+window._payMonth+'月';
}
function changePayMonth(delta){
  _initPayMonth();
  window._payMonth+=delta;
  if(window._payMonth>12){window._payMonth=1;window._payYear++;}
  if(window._payMonth<1){window._payMonth=12;window._payYear--;}
  _updatePayLabel();
  loadPaymentForCurrentMonth();
}
function loadPaymentForCurrentMonth(){
  _initPayMonth();
  var y=window._payYear,m=window._payMonth;
  _updatePayLabel();
  // localStorageは使わずGASを正として初期化
  window._payData={};
  renderMgr();
  fetchPayments(y,m,true).then(function(map){
    window._payData=map;
    renderMgr();
  }).catch(function(e){console.error('pay load',e);showToast('入金状況の取得に失敗しました','err');});
}
function togglePayment(sid,checked){
  _initPayMonth();
  var y=window._payYear,m=window._payMonth;
  if(!window._payData)window._payData={};
  window._payData[sid]=checked;
  // キャッシュも同期しないと、月を切り替えて戻ったときに古いチェック状態が表示される
  var cacheKey=y+'-'+m;
  if(_payCache[cacheKey])_payCache[cacheKey][sid]=checked;
  var student=ALL_STUDENTS.find(function(s){return s.studentID===sid;})||{};
  gas('savePaymentStatus',{studentID:sid,studentName:student.name||'',year:y,month:m,paid:checked,isPaid:checked})
    .then(function(r){if(r&&r.status&&r.status!=='ok')throw new Error(r.message||'保存エラー');})
    .catch(function(e){
      console.error('pay save',e);
      // 保存失敗時はチェック状態を戻して通知
      window._payData[sid]=!checked;
      if(_payCache[cacheKey])_payCache[cacheKey][sid]=!checked;
      renderMgr();
      showToast('入金状況の保存に失敗しました','err');
    });
}
