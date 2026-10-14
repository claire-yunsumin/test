<script setup lang="ts">
import { computed,onMounted,ref } from 'vue';
import { ACTIVITIES,type ActivityType,type Moment } from './types/domain';
import { buildPatches } from './services/patchEngine';
import { getMoments,putMoment,removeMoment,getLegacyHabitCount } from './services/storage';
const tab=ref<'canvas'|'journal'|'gallery'|'settings'>('canvas');
const year=ref(new Date().getFullYear());
const moments=ref<Moment[]>([]);
const loading=ref(true);
const editing=ref<string|null>(null);
const formOpen=ref(false);
const draft=ref({date:localDate(),title:'',note:'',activity:'OTHER' as ActivityType});
const legacyCount=ref(0);
const notice=ref('');
const patches=computed(()=>buildPatches(moments.value,year.value));
const yearlyMoments=computed(()=>moments.value.filter(m=>m.occurredOn.startsWith(String(year.value)+'-')));
const years=computed(()=>[...new Set([year.value,new Date().getFullYear(),...moments.value.map(m=>Number(m.occurredOn.slice(0,4)))])].sort((a,b)=>b-a));
function localDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
onMounted(async()=>{try{moments.value=await getMoments();legacyCount.value=getLegacyHabitCount();}catch{notice.value='저장소를 열지 못했어요. 브라우저 설정을 확인해 주세요.';}finally{loading.value=false;}});
function openNew(){editing.value=null;draft.value={date:localDate(),title:'',note:'',activity:'OTHER'};formOpen.value=true;}
function openEdit(m:Moment){editing.value=m.id;draft.value={date:m.occurredOn,title:m.title,note:m.note,activity:m.activity};formOpen.value=true;}
async function save(){if(!draft.value.title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(draft.value.date))return;const now=new Date().toISOString();const old=moments.value.find(m=>m.id===editing.value);const item:Moment={id:old?.id||crypto.randomUUID(),occurredOn:draft.value.date,title:draft.value.title.trim(),note:draft.value.note.trim(),activity:draft.value.activity,source:'MANUAL',createdAt:old?.createdAt||now,updatedAt:now};try{await putMoment(item);moments.value=await getMoments();year.value=Number(item.occurredOn.slice(0,4));formOpen.value=false;notice.value='기록을 저장했어요.';}catch{notice.value='저장에 실패했어요. 다시 시도해 주세요.';}}
async function del(m:Moment){if(!confirm('이 기록을 삭제할까요?'))return;try{await removeMoment(m.id);moments.value=await getMoments();formOpen.value=false;}catch{notice.value='삭제하지 못했어요.';}}
const sizeClass=(size:string)=>'patch-'+size.toLowerCase();
</script>
<template>
<div class="app-shell">
 <header class="header"><div class="eyebrow">A LITTLE LIFE, BEAUTIFULLY KEPT</div><div class="brandline"><div><h1>daystitch <span>✳</span></h1><p>당신의 하루를 한 땀씩 수놓아요.</p></div><button class="round-btn" aria-label="새 기록" @click="openNew">＋</button></div></header>
 <div v-if="notice" class="notice" role="status" @click="notice=''">{{notice}} <span>×</span></div>
 <main v-if="!loading">
  <section v-if="tab==='canvas'" class="section">
   <div class="section-head"><div><div class="eyebrow">YOUR YEAR IN STITCHES</div><h2>{{year}}년의 조각들</h2></div><select v-model.number="year" aria-label="연도 선택"><option v-for="y in years" :key="y" :value="y">{{y}}년</option></select></div>
   <div class="canvas"><div class="canvas-texture"></div><div v-for="month in 12" :key="month" class="month-guide" :style="{left:((month-1)%3*33.333)+'%',top:(Math.floor((month-1)/3)*25)+'%'}"><small>{{String(month).padStart(2,'0')}}</small></div>
    <button v-for="p in patches" :key="p.id" class="patch" :class="sizeClass(p.size)" :style="{left:p.x+'%',top:p.y+'%',transform:'translate(-50%,-50%) rotate('+p.rotation+'deg)',background:ACTIVITIES[p.activity].color}" :aria-label="p.month+'월 '+ACTIVITIES[p.activity].label+' '+p.count+'회'" @click="tab='journal'"><span>{{ACTIVITIES[p.activity].icon}}</span><small>{{p.count}}</small></button>
    <div v-if="!patches.length" class="canvas-empty"><div>🪡</div><strong>아직 비어 있는 캔버스</strong><p>첫 하루를 기록하면 자수가 시작돼요.</p><button class="primary" @click="openNew">첫 기록 남기기</button></div>
   </div>
   <div class="summary"><div><b>{{yearlyMoments.length}}</b><small>기록한 순간</small></div><div><b>{{new Set(yearlyMoments.map(m=>m.occurredOn)).size}}</b><small>기록한 날</small></div><div><b>{{patches.length}}</b><small>완성된 패치</small></div></div>
  </section>
  <section v-else-if="tab==='journal'" class="section"><div class="section-head"><div><div class="eyebrow">THE LITTLE MOMENTS</div><h2>나의 하루 기록</h2></div><button class="primary" @click="openNew">＋ 기록</button></div><div v-if="!moments.length" class="empty-list">아직 기록이 없어요. 오늘의 순간을 남겨보세요.</div><button v-for="m in moments" :key="m.id" class="moment" @click="openEdit(m)"><span class="moment-icon">{{ACTIVITIES[m.activity].icon}}</span><span class="moment-content"><small>{{m.occurredOn}} · {{ACTIVITIES[m.activity].label}}</small><strong>{{m.title}}</strong><span v-if="m.note">{{m.note}}</span></span><span class="chevron">›</span></button></section>
  <section v-else-if="tab==='gallery'" class="section"><div class="eyebrow">A GALLERY OF YEARS</div><h2>나의 전시실</h2><button v-for="y in years" :key="y" class="gallery-item" @click="year=y;tab='canvas'"><span>✳</span><div><strong>{{y}}년의 작품</strong><small>{{moments.filter(m=>m.occurredOn.startsWith(String(y)+'-')).length}}개의 순간</small></div><span>↗</span></button></section>
  <section v-else class="section"><div class="eyebrow">YOUR SPACE</div><h2>설정 및 데이터</h2><div class="info-card"><strong>로컬 우선 저장</strong><p>기록은 이 브라우저의 IndexedDB에 저장됩니다. 브라우저 데이터를 지우면 복구할 수 없으므로 중요한 기록은 별도로 보관해 주세요.</p></div><div v-if="legacyCount" class="info-card"><strong>이전 습관 트래커 데이터 감지</strong><p>기존 습관 {{legacyCount}}개가 발견되었어요. 이전 데이터는 수정하거나 삭제하지 않았습니다. 자동 변환하지 않아요.</p></div><div class="info-card"><strong>현재 구현 범위</strong><p>수동 기록·활동 분류·패치·연간 캔버스·전시실. 사진 분석·AI·클라우드 동기화는 아직 지원하지 않아요.</p></div></section>
 </main>
 <nav class="bottom-nav" aria-label="주요 메뉴"><button :class="{active:tab==='canvas'}" @click="tab='canvas'"><span>✳</span>캔버스</button><button :class="{active:tab==='journal'}" @click="tab='journal'"><span>✎</span>기록</button><button :class="{active:tab==='gallery'}" @click="tab='gallery'"><span>▦</span>전시실</button><button :class="{active:tab==='settings'}" @click="tab='settings'"><span>⚙</span>설정</button></nav>
 <div v-if="formOpen" class="overlay" @click.self="formOpen=false"><form class="editor" @submit.prevent="save"><div class="editor-head"><div><div class="eyebrow">STITCH A MEMORY</div><h2>{{editing?'기록 수정':'오늘의 순간'}}</h2></div><button type="button" class="close" @click="formOpen=false">×</button></div><label>날짜<input v-model="draft.date" type="date" required></label><label>오늘의 제목<input v-model="draft.title" maxlength="80" placeholder="어떤 하루였나요?" required></label><label>활동 카테고리<select v-model="draft.activity"><option v-for="(a,key) in ACTIVITIES" :key="key" :value="key">{{a.icon}} {{a.label}}</option></select></label><label>한 줄 기록<textarea v-model="draft.note" rows="3" maxlength="1000" placeholder="기억하고 싶은 순간을 적어주세요."></textarea></label><div class="editor-actions"><button v-if="editing" type="button" class="danger" @click="del(moments.find(m=>m.id===editing)!)">삭제</button><button class="primary" type="submit">저장하고 수놓기</button></div></form></div>
</div>
</template>
