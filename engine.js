/* Эфемеридный движок «Код привлекательности».
   Солнце, Меркурий, Венера, Марс: орбитальные элементы Paul Schlyter (как в калькуляторе прогноза).
   Юпитер, Сатурн, Уран, Нептун, Плутон: помесячная таблица Skyfield/DE421 (outer.js), линейная интерполяция. */
(function(root){
  "use strict";
  var RAD = Math.PI/180;
  function rev(x){ x = x - Math.floor(x/360)*360; return x<0? x+360 : x; }
  function daysSinceEpoch(date){
    var y=date.getUTCFullYear(), m=date.getUTCMonth()+1,
        d=date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes()/60)/24;
    return 367*y - Math.floor(7*(y+Math.floor((m+9)/12))/4) + Math.floor(275*m/9) + d - 730530;
  }
  function eccAnomaly(Mdeg, e){
    var M = rev(Mdeg)*RAD, E = M + e*Math.sin(M)*(1+e*Math.cos(M));
    for (var i=0;i<8;i++){ var dE=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E)); E-=dE; if(Math.abs(dE)<1e-7)break; }
    return E;
  }
  var ELEMENTS = {
    sun:     function(d){ return {N:0, i:0, w: rev(282.9404 + 4.70935e-5*d), a:1.000000, e: 0.016709 - 1.151e-9*d, M: rev(356.0470 + 0.9856002585*d)}; },
    mercury: function(d){ return {N: rev(48.3313 + 3.24587e-5*d), i: 7.0047 + 5.00e-8*d, w: rev(29.1241 + 1.01444e-5*d), a:0.387098, e:0.205635 + 5.59e-10*d, M: rev(168.6562 + 4.0923344368*d)}; },
    venus:   function(d){ return {N: rev(76.6799 + 2.46590e-5*d), i: 3.3946 + 2.75e-8*d, w: rev(54.8910 + 1.38374e-5*d), a:0.723330, e:0.006773 - 1.302e-9*d, M: rev(48.0052 + 1.6021302244*d)}; },
    mars:    function(d){ return {N: rev(49.5574 + 2.11081e-5*d), i: 1.8497 - 1.78e-8*d, w: rev(286.5016 + 2.92961e-5*d), a:1.523688, e:0.093405 + 2.516e-9*d, M: rev(18.6021 + 0.5240207766*d)}; }
  };
  function orbital(el){
    var E = eccAnomaly(el.M, el.e);
    var xv = el.a*(Math.cos(E)-el.e), yv = el.a*(Math.sqrt(1-el.e*el.e)*Math.sin(E));
    var v = rev(Math.atan2(yv,xv)/RAD), r = Math.sqrt(xv*xv+yv*yv);
    var Nr=el.N*RAD, ir=el.i*RAD, vw=(v+el.w)*RAD;
    return { x: r*(Math.cos(Nr)*Math.cos(vw)-Math.sin(Nr)*Math.sin(vw)*Math.cos(ir)),
             y: r*(Math.sin(Nr)*Math.cos(vw)+Math.cos(Nr)*Math.sin(vw)*Math.cos(ir)) };
  }
  function innerLon(planet, date){
    var d = daysSinceEpoch(date), s = orbital(ELEMENTS.sun(d));
    if (planet==='sun') return rev(Math.atan2(s.y,s.x)/RAD);
    var p = orbital(ELEMENTS[planet](d));
    return rev(Math.atan2(p.y+s.y, p.x+s.x)/RAD);
  }
  function outerLon(planet, date){
    var T = root.OUTER, start = root.OUTER_START;
    var y = date.getUTCFullYear(), m = date.getUTCMonth();
    var idx = (y-start)*12 + m;
    var arr = T[planet];
    if (idx < 0 || idx >= arr.length-1) return null;
    var monthStart = Date.UTC(y, m, 1), next = Date.UTC(y, m+1, 1);
    var f = (date.getTime()-monthStart)/(next-monthStart);
    var a = arr[idx], b = arr[idx+1], diff = b - a;
    if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
    return rev(a + diff*f);
  }
  function lon(planet, date){
    return (planet in ELEMENTS) ? innerLon(planet, date) : outerLon(planet, date);
  }
  // аспекты Венеры: соединение, квадрат, оппозиция (напряжённые + соединение, как у Ольги на эфире 09.10)
  var ORB = 6;
  var ASPECT_PLANETS = ['saturn','uranus','neptune','pluto','mars','jupiter','sun','mercury'];
  var ASPECTS = [{name:'conj', angle:0},{name:'square', angle:90},{name:'opp', angle:180}];
  function venusAspects(date){
    var v = lon('venus', date), found = [];
    ASPECT_PLANETS.forEach(function(p){
      var pl = lon(p, date); if (pl === null) return;
      var sep = Math.abs(rev(v - pl)); if (sep > 180) sep = 360 - sep;
      ASPECTS.forEach(function(a){
        if ((p==='sun' || p==='mercury') && a.name!=='conj') return;
        var orb = Math.abs(sep - a.angle);
        if (orb <= ORB) found.push({planet:p, aspect:a.name, orb:Math.round(orb*10)/10});
      });
    });
    found.sort(function(x,y){ return x.orb - y.orb; });
    return found;
  }
  function moonSign(day, month, year){
    var start = Date.UTC(1935,0,1), idx = Math.round((Date.UTC(year,month-1,day)-start)/86400000);
    var ch = root.MOON.charAt(idx); return ch ? parseInt(ch,16) : null;
  }
  // транзиты медленных планет к натальной Венере на дату now (орбис 3°), плюс где сейчас Венера
  var T_ASPECTS = [{name:'conj',angle:0},{name:'sextile',angle:60},{name:'square',angle:90},{name:'trine',angle:120},{name:'opp',angle:180}];
  function transits(natalVenus, now){
    var res = [];
    ['jupiter','saturn','uranus','neptune','pluto'].forEach(function(p){
      var pl = outerLon(p, now); if (pl === null) return;
      var sep = Math.abs(rev(natalVenus - pl)); if (sep > 180) sep = 360 - sep;
      T_ASPECTS.forEach(function(a){ var orb = Math.abs(sep-a.angle); if (orb <= 3) res.push({planet:p, aspect:a.name, orb:Math.round(orb*10)/10}); });
    });
    res.sort(function(x,y){ return x.orb - y.orb; });
    var tv = innerLon('venus', now);
    var dist = (Math.floor(tv/30) - Math.floor(natalVenus/30) + 12) % 12;
    var d1 = new Date(now.getTime()-36e5*36), d2 = new Date(now.getTime()+36e5*36);
    var dd = innerLon('venus', d2) - innerLon('venus', d1); if (dd>180) dd-=360; if (dd<-180) dd+=360;
    return { outer: res, venusNowSign: Math.floor(tv/30)%12, signDist: dist, venusRetro: dd < 0 };
  }
  function natal(day, month, year){
    var date = new Date(Date.UTC(year, month-1, day, 9, 0)); // полдень по Москве
    var v = lon('venus', date), s = lon('sun', date);
    return { venusLon: v, venusSign: Math.floor(v/30)%12, venusDeg: Math.floor(v%30),
             sunSign: Math.floor(s/30)%12, moonSign: moonSign(day,month,year), aspects: venusAspects(date) };
  }
  root.KodEngine = { lon: lon, natal: natal, venusAspects: venusAspects, transits: transits };
})(typeof window !== 'undefined' ? window : globalThis);
