import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../dist/i18n.js',import.meta.url),'utf8');
function load(language,saved){
  const browser={
    navigator:{language},
    localStorage:{getItem:()=>saved,setItem:(key,value)=>{
      assert.equal(key,'little-archive-language');
      saved=value;
    }}
  };
  return runInNewContext(source.replace(/^export /gm,'')+
    '\n({messages:words, selected:()=>lang, setLanguage, t, dateText, countText, periodText, ageText})',browser);
}

test('every catalog entry has three translations and the official name is consistent',()=>{
  const {messages,t}=load('es-ES');
  for(const [key,translations] of Object.entries(messages)){
    assert.equal(translations.length,3,key);
    for(const text of translations)assert.ok(text.trim()&&!text.includes('Little Archive'),key);
  }
  assert.equal(t('tagline'),'Pequeños dibujos. Grandes recuerdos.');
  assert.equal(t('tagline','ru'),'Маленькие рисунки. Большие воспоминания.');
  assert.equal(t('tagline','en'),'Little art. Big memories.');
});

test('Spanish supports regional defaults, dates and counts with a switch to saved English or Russian',()=>{
  const spanish=load('es-MX');
  assert.equal(spanish.selected(),'es');
  assert.equal(spanish.countText(0),'0 obras');
  assert.equal(spanish.countText(1),'1 obra');
  assert.equal(spanish.countText(14),'14 obras');
  assert.equal(spanish.periodText(0),'0–1 año');
  assert.equal(spanish.periodText(1),'1–2 años');
  assert.equal(spanish.ageText({years:1,months:2}),'1 año 2 meses');
  assert.match(spanish.dateText('2024-01-02'),/ene/i);
  assert.equal(load('es-ES','ru').selected(),'ru');
  assert.equal(load('de-DE','unsupported').selected(),'en');
  spanish.setLanguage('en');assert.equal(spanish.countText(2),'2 artworks');
  spanish.setLanguage('ru');assert.equal(spanish.countText(23),'23 работы');
  spanish.setLanguage('invalid');assert.equal(spanish.selected(),'ru');
});
