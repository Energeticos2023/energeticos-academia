"""Prepara el aula pública sin copiar material pagado al repositorio."""
from pathlib import Path
import json, re, shutil

root=Path(__file__).resolve().parent.parent
previous=root.parent/'energeticos-academia'/'dist'
private=root/'private-course'/'flotas-electricas-peru'/'module-1'
private.mkdir(parents=True,exist_ok=True)
raw=(previous/'course-data.js').read_text(encoding='utf-8')
data=json.loads(raw[len('window.COURSE = '):].strip().removesuffix(';'))
for lesson in data['lessons']:
    lesson['html']=re.sub(r'src="assets/([^"/]+)"',r'data-private-path="flotas-electricas-peru/module-1/assets/\1"',lesson['html'])
(private/'course-data.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
for folder in ['assets','materiales']:(private/folder).mkdir(exist_ok=True)
for file in (previous/'assets').iterdir():
    if file.name.startswith('image'):shutil.copy2(file,private/'assets'/file.name)
for file in (previous/'materiales').iterdir():shutil.copy2(file,private/'materiales'/file.name)
for name in ['energeticos.webp','rafael-zena.webp','favicon.svg']:shutil.copy2(previous/'assets'/name,root/'web'/'assets'/name)
shutil.copy2(previous/'styles.css',root/'web'/'styles.css')
app=(previous/'app.js').read_text(encoding='utf-8')
app=app.replace('(() => {','window.startAcademy = () => {',1)
app=app.rstrip().removesuffix('})();')+'};\n'
app=app.replace("const KEY = 'energeticos-academia-m1-v1';","const KEY = 'energeticos-academia-m1-v1:' + window.ACADEMY.userId;")
app=app.replace("const saved = JSON.parse(localStorage.getItem(KEY) || 'null');","const saved = window.ACADEMY.initialProgress || JSON.parse(localStorage.getItem(KEY) || 'null');")
app=app.replace("localStorage.setItem(KEY, JSON.stringify(state)); storageAvailable = true;","localStorage.setItem(KEY, JSON.stringify(state)); storageAvailable = true; window.ACADEMY.queueSave(JSON.parse(JSON.stringify(state)));")
app=app.replace("draft: '', quiz: null", "draft: '', quiz: null, selfAssessments: {}")
app=app.replace("state.quiz = saved.quiz", "state.selfAssessments = saved.selfAssessments && typeof saved.selfAssessments === 'object' && !Array.isArray(saved.selfAssessments) ? saved.selfAssessments : {};\n      state.quiz = saved.quiz")
app=app.replace("  const $ = s =>", "  window.ACADEMY.onSelfResult = (id, result) => { state.selfAssessments[id] = result; save(); };\n  window.ACADEMY.getSelfResult = id => state.selfAssessments[id];\n  const $ = s =>",1)
app=app.replace("'actividad','practica','cierre','bibliografia'", "'actividad','evaluacion-final','cierre','bibliografia'")
app=app.replace("new Set([...lessons.map(l => l.id), 'practica'])", "new Set(lessons.map(l => l.id))")
app=app.replace("if(id==='practica')return quizView();", "")
app=app.replace('href="#leccion/practica"', 'href="#leccion/evaluacion-final"')
app=app.replace('Comprueba tus conocimientos →', 'Ir a la evaluación final →')
app=app.replace("sidebar();updateProgress();bind();closeMenu();", "sidebar();updateProgress();bind();window.ACADEMY.mountAssessments?.();closeMenu();")
(root/'web'/'app.js').write_text(app,encoding='utf-8')
old=(previous/'index.html').read_text(encoding='utf-8')
body=old.split('<body>',1)[1].split('</body>',1)[0]
body=body.replace('<header class="topbar">','<div class="student-bar"><span id="student-email"></span><button id="logout" type="button">Cerrar sesión</button></div><header class="topbar">',1)
head=old.split('<body>',1)[0].replace('<script defer src="course-data.js"></script><script defer src="app.js"></script>','<link rel="stylesheet" href="auth.css"><script src="config.js"></script><script defer src="app.js"></script><script type="module" src="auth.bundle.js"></script>')
head=head.replace('<meta name="theme-color"','<meta name="referrer" content="strict-origin-when-cross-origin"><meta name="theme-color"')
head=head.replace('<link rel="stylesheet" href="auth.css">','<link rel="stylesheet" href="auth.css"><link rel="stylesheet" href="assessments.css">')
public=(root/'src'/'public.html').read_text(encoding='utf-8')
(root/'web'/'index.html').write_text(head+'<body>'+public+'<div id="classroom" hidden>'+body+'</div></body></html>',encoding='utf-8')
(root/'web'/'.nojekyll').touch()
print('Interfaz pública preparada. Contenido de pago separado en private-course/ (ignorado por Git).')
