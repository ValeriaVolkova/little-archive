export const appName='Drawkeeper';
export const languages=Object.freeze({en:'English',es:'Español',ru:'Русский'});
const translationIndex={ru:0,en:1,es:2};
const languageKey='little-archive-language';
const knownLanguage=(value)=>Object.hasOwn(languages,value);
let saved;
try{saved=localStorage.getItem(languageKey);}catch{/* Browser storage may be unavailable. */}
const browserLanguage=(navigator.language||'en').split('-')[0].toLowerCase();
export let lang=knownLanguage(saved)?saved:knownLanguage(browserLanguage)?browserLanguage:'en';
export function setLanguage(value){
  if(!knownLanguage(value))return;
  lang=value;
  try{localStorage.setItem(languageKey,value);}catch{/* Keep the choice for this session. */}
}
const words={
myCollection:['Моя коллекция','My collection','Mi colección'],
littleArtists:['Маленькие художники','Little artists','Pequeños artistas'],
artByAge:['Творчество по возрастам','Art by age','Arte por edades'],
atTheSameAge:['В одном возрасте','At the same age','A la misma edad'],
firstAndLast:['Первый и последний рисунок','First and latest artwork','Primera y última obra'],
firstDrawing:['Первый рисунок','First artwork','Primera obra'],
latestDrawing:['Последний рисунок','Latest artwork','Última obra'],
boot:["Открываем вашу коллекцию…", "Opening your collection…", "Abriendo tu colección…"],
demoFlowers:["Цветы для мамы", "Flowers for mum", "Flores para mamá"],
demoRainbow:["После дождя", "After the rain", "Después de la lluvia"],
demoFish:["Рыбка мечты", "A little dream fish", "El pez de mis sueños"],
demoHouse:["Наш уютный дом", "Home, sweet home", "Hogar, dulce hogar"],
demoSun:["Солнечный день", "A sunny kind of day", "Un día soleado"],
demoLeaf:["Осенние сокровища", "Autumn treasures", "Tesoros de otoño"],
demoAlbum:["Маленькие открытия", "Little discoveries", "Pequeños descubrimientos"],
demoNote:["«Это тебе, мама. Чтобы цветы были всегда».", "“These are for you, mum. So the flowers stay forever.”", "«Para ti, mamá. Para que siempre haya flores»."],
jacketcream:['Молочная','Cream',"Crema"],jacketpeach:['Персиковая','Peach',"Melocotón"],jacketsage:['Шалфей','Sage',"Cuadros lilas"],jacketsky:['Голубая','Sky',"Azul cielo"],
jacketlavender:['Лавандовая','Lavender',"Lavanda"],jacketbutter:['Жёлтая','Butter',"Amarillo suave"],jacketterracotta:['Терракота','Terracotta',"Terracota"],jacketpaper:['Бумажная','Paper',"Papel"],
childArtworkCover:['Рисунок ребёнка','Child’s artwork',"Dibujo infantil"],artworkActions:['Действия с рисунком','Artwork actions',"Acciones de la obra"],
allDrawings:['Все рисунки','All artwork',"Todas las obras"],description:['Описание','Description',"Descripción"],familyAlbum:['Семейный альбом','Family album',"Álbum familiar"],
addWorks:['Добавить работы','Add artwork',"Añadir obras"],albumSettings:['Редактировать альбом','Edit album',"Editar álbum"],emptyBook:['Добавьте первые работы в этот альбом.','Choose the first artworks for this album.',"Elige las primeras obras para este álbum."],
editOrder:['Изменить порядок и состав','Reorder or remove artwork',"Reordenar o quitar obras"],unlink:['Убрать из альбома','Remove from album',"Quitar del álbum"],selectedWorks:['Выбрано','Selected',"Selección"],
changeAlbumChild:['Убрать из альбома работы других детей? Они останутся в архиве.','Remove other children’s artwork from this album? It will stay in the archive.',"¿Quitar del álbum las obras de otros niños? Seguirán en el archivo."],
profilePhoto:['Фото профиля','Profile photo',"Foto de perfil"],deleteProfile:['Удалить профиль','Delete profile',"Eliminar perfil"],
profileInUse:['У профиля есть работы, личные альбомы или черновики. Профиль сохранён, чтобы защитить эти записи.','This profile has artwork, personal albums or drafts. It is kept to protect those records.',"Este perfil tiene obras, álbumes propios o borradores. Se conserva para proteger esos datos."],
confirmProfileDelete:['Удалить пустой профиль и его аватар?','Delete this empty profile and its avatar?',"¿Eliminar este perfil vacío y su foto?"],
appVersion:['Версия приложения','App version',"Versión de la aplicación"],updateAvailable:['Доступна новая версия','A new version is available',"Hay una nueva versión disponible"],applyUpdate:['Обновить','Update',"Actualizar"],
updating:['Открываем новую версию…','Opening the new version…',"Abriendo la nueva versión…"],
updateOtherWindows:['Сохраните работу и закройте другие окна Drawkeeper, затем нажмите «Обновить».','Save your work and close other Drawkeeper windows, then choose Update.',"Guarda tu trabajo y cierra las otras ventanas de Drawkeeper. Después, pulsa «Actualizar»."],
updateRetry:['Обновление можно повторить.','You can retry the update.',"Puedes volver a intentar la actualización."],
addDrawing:['Добавить рисунок','Add artwork',"Añadir dibujo"],
growingArt:['Маленькая история взросления','Growing up in art',"Crecer dibujando"],filters:['Фильтры','Filters',"Filtros"],
emptyChapters:['Здесь появятся главы, когда у рисунка будет дата, а у ребёнка — дата рождения.','Chapters appear when your child has a birthday and a dated artwork.',"Añade una obra con fecha y la fecha de nacimiento en el perfil para ver las etapas."],
home:['Главная','Home',"Inicio"],welcomeFirst:['Сохраните первые рисунки и поделки в семейном архиве.','Save the first drawings and crafts in your family archive.',"Guarda los primeros dibujos y manualidades en tu archivo familiar."],
welcomeFamily:['Здесь растёт история вашего творчества.','This is where your family’s creativity grows.',"Aquí crece la historia creativa de tu familia."],
addFirstChild:['Создать первый профиль','Create the first profile',"Crear el primer perfil"],tryDemo:['Посмотреть демо','Explore the demo',"Explorar la demostración"],
requiredBirthday:['Дата рождения','Date of birth',"Fecha de nacimiento"],
addArtwork:['Добавить работу','Add artwork',"Añadir obra"],firstArtwork:['Добавить первую работу','Add the first artwork',"Añadir la primera obra"],
familyChildren:['Дети','Children',"Niños"],familyWorks:['Работы','Artworks',"Obras"],familyAlbums:['Альбомы','Albums',"Álbumes"],
ageCollections:['По возрасту','By age',"Por edad"],recentMemories:['Недавние работы','Recent memories',"Obras recientes"],viewAll:['Смотреть все','View all',"Ver todo"],
openArchive:['Открыть архив','Open archive',"Abrir el archivo"],familyFilter:['Все дети','All children',"Todos los niños"],allAges:['Любой возраст','All ages',"Todas las edades"],
uncategorized:['Без категории','No category',"Sin categoría"],replacePhoto:['Заменить фото','Replace photo',"Cambiar foto"],mediaLibrary:['Медиатека','Photo library',"Fototeca"],
chooseFile:['Выбрать файл','Choose file',"Elegir archivo"],photoSource:['Добавить фото','Add photo',"Añadir foto"],requiredPhoto:['Нужна одна фотография работы.','Choose one photo for this artwork.',"Elige una foto de esta obra."],
invalidCalendarDate:['Дата неизвестна','Date unavailable',"Fecha desconocida"],
draftReadError:['Некоторые черновики не удалось прочитать. Сохранённые работы остаются доступны.','Some drafts could not be read. Saved artwork remains available.',"No se pudieron leer algunos borradores. Las obras guardadas siguen disponibles."],
editPhotosUnavailable:['Не удалось открыть все фотографии работы. Сохранение отключено, чтобы сохранить исходную запись. Если есть резервная копия, попробуйте восстановить её.','Some artwork photos could not be opened. Saving is disabled to protect the existing record. If you have a backup, try restoring it.',"No se pudieron abrir todas las fotos de la obra. Se ha desactivado el guardado para proteger la ficha original. Si tienes una copia de seguridad, intenta restaurarla."],
saveQuota:['Недостаточно места для сохранения. Не закрывайте форму и не очищайте данные сайта. Освободите место на устройстве и повторите попытку.','Not enough storage. Keep this form open and do not clear site data. Free device space and retry.',"No hay espacio suficiente. Mantén el formulario abierto y conserva los datos del sitio. Libera espacio en el dispositivo y vuelve a intentarlo."],
saveDraftConflict:['Черновик изменился в другой вкладке. Не закрывайте эту форму: изменения не записаны.','This draft changed in another tab. Keep this form open: these changes have not been saved.',"El borrador cambió en otra pestaña. Mantén el formulario abierto: estos cambios aún no se han guardado."],
saveArchiveConflict:['Архив изменился в другой вкладке. Не закрывайте форму: сохранение отменено, чтобы не перезаписать другие работы.','The archive changed in another tab. Keep this form open: saving stopped to protect other artwork.',"El archivo cambió en otra pestaña. Mantén el formulario abierto: se ha detenido el guardado para proteger las otras obras."],
savePermission:['Safari не разрешил запись в хранилище. Не закрывайте форму. Проверьте, что это обычная, а не приватная вкладка.','Safari did not allow storage access. Keep the form open. Check that this is a regular rather than private tab.',"Safari no permitió escribir en el almacenamiento. Mantén el formulario abierto y comprueba que la pestaña no sea privada."],
saveImageStorage:['Браузер не смог записать фотографию. Не закрывайте форму; сообщите код ошибки ниже.','The browser could not store the photograph. Keep this form open and report the error code below.',"El navegador no pudo guardar la foto. Mantén el formulario abierto e indica el código de error que aparece debajo."],
saveInvalid:['Не удалось проверить данные работы. Проверьте дату, профиль ребёнка и наличие фотографии. Форма остаётся открытой.','Artwork validation failed. Check the date, child and photograph. The form remains open.',"No se pudieron validar los datos. Comprueba la fecha, el perfil y la foto. El formulario sigue abierto."],
resumeDraft:['Продолжить черновик','Resume draft',"Continuar borrador"],draftClose:['Закрыть форму? Сохранённый черновик останется в архиве для продолжения.','Close this form? The saved draft will remain available to resume.',"¿Cerrar el formulario? Podrás continuar el borrador guardado desde el archivo."],draftSaved:['Черновик сохранён на устройстве','Draft saved on this device',"Borrador guardado en el dispositivo"],draftSaving:['Сохраняем черновик…','Saving draft…',"Guardando el borrador…"],draftError:['Черновик не сохранён. Не закрывайте вкладку: проверьте свободное место или сохраните работу.','Draft not saved. Keep this tab open: check available storage or save the artwork.',"No se guardó el borrador. Mantén la pestaña abierta y comprueba el espacio disponible o guarda la obra."],
addPhoto:['Добавить фото','Add photo',"Añadir foto"],
albumEyebrow:['Истории на полке','Stories on the shelf',"Historias en la estantería"],
themechecker:['Checker Fun','Checker Fun',"Cuadros divertidos"],themeflower:['Flower Power','Flower Power',"Entre flores"],themewavy:['Wavy Days','Wavy Days',"Días de olas"],themedoodle:['Doodle Club','Doodle Club',"Club de garabatos"],
emptyFavorites:['Самое любимое — сюда','A place for your favorites',"Un lugar para tus favoritas"],emptyFavoritesHint:['Нажмите на сердечко у работы, которую хочется видеть чаще.','Tap a heart on an artwork you love. It will be waiting here.',"Pulsa el corazón de una obra para añadirla a tus favoritas."],browseWorks:['Посмотреть работы','Explore artwork',"Ver las obras"],noMatchesHint:['Попробуйте другую категорию или уберите фильтры.','Try another category or clear your filters.',"Prueba otra categoría o borra los filtros."],parentNote:['На память','A little memory',"Para el recuerdo"],

archive:['Архив','Archive',"Archivo"],albums:['Альбомы','Albums',"Álbumes"],settings:['Настройки','Settings',"Ajustes"],
tagline:['Маленькие рисунки. Большие воспоминания.','Little art. Big memories.',"Pequeños dibujos. Grandes recuerdos."],collection:['Ваш маленький музей','Your little art museum',"Tu pequeño museo"],
headline:['Большое искусство\nмаленьких рук.','A little world\nof big ideas.',"Un pequeño mundo de grandes ideas."],
subtitle:['Рисунки, поделки и моменты, которые хочется сохранить.','Drawings, handmade treasures, and moments worth keeping.',"Dibujos, manualidades y momentos que merece la pena guardar."],
add:['Добавить работу','Add artwork',"Añadir obra"],all:['Все работы','All artwork',"Todas las obras"],favorites:['Избранное','Favorites',"Favoritas"],allChildren:['Все дети','All children',"Todos los niños"],addChild:['Добавить ребёнка','Add child',"Añadir perfil infantil"],
search:['Найти работу…','Find a little masterpiece…',"Buscar una obra…"],anyYear:['Все годы','All years',"Todos los años"],anyCategory:['Все категории','All categories',"Todas las categorías"],
newest:['Сначала новые','Newest first',"Más recientes primero"],oldest:['Сначала старые','Oldest first',"Más antiguas primero"],byAge:['По возрасту','By age',"Por edad"],byCategory:['По категории','By category',"Por categoría"],
drawing:['Рисунок','Drawing',"Dibujo"],painting:['Живопись','Painting',"Pintura"],collage:['Аппликация','Collage',"Collage"],modeling:['Лепка','Modeling',"Modelado"],craft:['Поделка','Craft',"Manualidad"],other:['Другое','Other',"Otra"],
local:['Хранится на этом устройстве','Saved on this device',"Guardado en este dispositivo"],private:['Без аккаунтов и загрузки фото на сервер','No accounts. No photo uploads.',"Sin cuentas ni envío de fotos a servidores"],
demo:['Демо-коллекция','Demo collection',"Colección de muestra"],demoHint:['Это примеры работ. Создайте свой архив, чтобы сохранить творчество вашего ребёнка.','These are sample artworks. Start your own archive to keep your child’s creations.',"Estas obras son ejemplos. Crea tu propio archivo para guardar las creaciones de tu familia."],
start:['Начать свой архив','Start my archive',"Empezar mi archivo"],empty:['Здесь начинается ваша история','Your story starts here',"Aquí empieza tu historia"],emptyHint:['Сохраните первый рисунок. Через несколько лет он станет ещё дороже.','Save their first drawing. One day, it will mean even more.',"Guarda su primer dibujo. Con los años será aún más especial."],
noMatches:['Пока ничего не нашлось','No artwork found',"No se encontraron obras"],clearFilters:['Сбросить фильтры','Clear filters',"Borrar filtros"],cancel:['Отмена','Cancel',"Cancelar"],save:['Сохранить','Save',"Guardar"],close:['Закрыть','Close',"Cerrar"],delete:['Удалить','Delete',"Eliminar"],edit:['Изменить','Edit',"Editar"],
name:['Имя ребёнка','Child’s name',"Nombre"],birthday:['Дата рождения · необязательно','Birthday · optional',"Fecha de nacimiento · opcional"],color:['Цвет профиля','Profile color',"Color del perfil"],profile:['Профиль ребёнка','Child profile',"Perfil infantil"],
title:['Название · необязательно','Title · optional',"Título · opcional"],date:['Дата создания работы','Artwork date',"Fecha de creación"],child:['Ребёнок','Child',"Niño o niña"],category:['Категория','Category',"Categoría"],notes:['История этой работы · необязательно','The story behind it · optional',"Historia de esta obra · opcional"],
titlePlaceholder:['Например, «Наше лето»','For example, “Our summer”',"Por ejemplo, «Nuestro verano»"],notesPlaceholder:['Что вдохновило маленького художника?','What inspired your little artist?',"¿Qué inspiró esta obra?"],
photos:['Фотографии','Photos',"Fotos"],choose:['Галерея','Photo library',"Fototeca"],camera:['Камера','Camera',"Cámara"],drop:['Начнём с фотографии','It starts with a photo',"Todo empieza con una foto"],formats:['JPG, PNG, WebP · до 5 фотографий','JPG, PNG, WebP · up to 5 photos',"JPG, PNG, WebP · hasta 5 fotos"],
cover:['Обложка','Cover',"Portada"],makeCover:['Сделать обложкой','Use as cover',"Usar como portada"],removePhoto:['Убрать фото','Remove photo',"Quitar foto"],rotate:['Повернуть','Rotate',"Girar"],original:['Вернуть оригинал','Restore original',"Volver a la foto original"],
newWork:['Новая работа','New artwork',"Nueva obra"],editWork:['Изменить работу','Edit artwork',"Editar obra"],untitled:['Без названия','Untitled artwork',"Obra sin título"],favorite:['В избранное','Add to favorites',"Añadir a favoritas"],unfavorite:['Убрать из избранного','Remove from favorites',"Quitar de favoritas"],
share:['Поделиться фото','Share photo',"Compartir foto"],addAlbum:['В альбом','Add to album',"Añadir al álbum"],deleteTitle:['Удалить эту работу?','Delete this artwork?',"¿Eliminar esta obra?"],deleteHint:['Фотографии и запись будут удалены из архива и альбомов. Отменить это действие нельзя.','Its photos and record will be removed from the archive and albums. This cannot be undone.',"Se eliminarán la ficha y las fotos del archivo y de los álbumes. Esta acción es irreversible."],
saved:['Сохранено в вашем архиве','Saved to your archive',"Guardado en tu archivo"],deleted:['Работа удалена','Artwork deleted',"Obra eliminada"],error:['Не удалось завершить действие','Something went wrong',"No se pudo completar la acción"],
saveError:['Не удалось сохранить. Проверьте свободное место. Форма и выбранные фото остаются открытыми.','Could not save. Check available storage. Your form and selected photos are still here.',"No se pudo guardar. Comprueba el espacio disponible. El formulario y las fotos seleccionadas siguen abiertos."],
imageError:['Не удалось прочитать изображение. Используйте JPG, PNG или WebP. HEIC можно предварительно преобразовать в JPG.','Could not read this image. Use JPG, PNG or WebP. Convert HEIC to JPG first if needed.',"No se pudo leer la imagen. Usa JPG, PNG o WebP. Si es necesario, convierte HEIC a JPG."],
maxPhotos:['В одной работе может быть до 5 фотографий.','An artwork can have up to 5 photos.',"Cada obra admite hasta 5 fotos."],required:['Заполните обязательные поля и добавьте хотя бы одну фотографию.','Complete the required fields and add at least one photo.',"Rellena los campos obligatorios y añade al menos una foto."],
albumHeadline:['Истории, собранные вместе','Stories, gathered together',"Historias reunidas"],albumSubtitle:['Любимые работы — в коллекциях, к которым хочется возвращаться.','Favorite creations, collected into stories to return to.',"Reúne tus obras favoritas en colecciones para volver a disfrutar de ellas."],
createAlbum:['Создать альбом','Create album',"Crear álbum"],albumTitle:['Название альбома','Album title',"Título del álbum"],albumPlaceholder:['Например, «Первый год творчества»','For example, “A year of little wonders”',"Por ejemplo, «Un año de dibujos»"],
selectWorks:['Выберите работы','Choose artwork',"Elegir obras"],order:['Порядок страниц','Page order',"Orden de las páginas"],orderHint:['Перетаскивайте работы или используйте стрелки.','Drag artwork to reorder it, or use the arrows.',"Arrastra las obras o usa las flechas para cambiar el orden."],coverStyle:['Оформление PDF','PDF design',"Diseño del PDF"],minimal:['Минималистичное · белое','Minimal · white',"Minimalista · blanco"],warm:['Тёплое · молочное','Warm · cream',"Cálido · crema"],
emptyAlbums:['Каждый альбом — маленькая история','Every album tells a little story',"Cada álbum cuenta una pequeña historia"],emptyAlbumsHint:['Объедините любимые работы и создайте книгу на память.','Gather favorite artwork and create a keepsake book.',"Reúne tus obras favoritas y crea un libro para el recuerdo."],
pdf:['Создать PDF-книгу','Create PDF book',"Crear un libro en PDF"],captions:['Показывать названия и даты','Show titles and dates',"Mostrar títulos y fechas"],pdfBuilding:['Создаём книгу…','Creating your book…',"Creando tu libro…"],pdfReady:['Ваша книга готова','Your book is ready',"Tu libro está listo"],downloadPDF:['Скачать PDF','Download PDF',"Descargar PDF"],pdfNote:['A4 · один рисунок на страницу · пропорции сохранены','A4 · one artwork per page · original proportions',"A4 · una obra por página · proporciones originales"],
resolution:['У некоторых фотографий невысокое разрешение для печати. На бумаге они могут быть менее чёткими.','Some photos have a low print resolution and may look less sharp on paper.',"Algunas fotos tienen baja resolución para impresión y pueden verse menos nítidas en papel."],
albumDelete:['Удалить альбом? Работы останутся в архиве.','Delete this album? The artwork will stay in your archive.',"¿Eliminar este álbum? Las obras seguirán en tu archivo."],noWorks:['Сначала добавьте работу в архив.','Add artwork to your archive first.',"Añade primero una obra al archivo."],
settingsHeadline:['Место для самого важного','A home for what matters',"Un lugar para lo importante"],profiles:['Профили детей','Child profiles',"Perfiles infantiles"],backup:['Резервная копия','Backup',"Copia de seguridad"],backupHint:['Сохраните ZIP с оригиналами, профилями и альбомами. Он поможет перенести архив в другой браузер или на другое устройство.','Save a ZIP with originals, profiles, and albums. Use it to move your archive to another browser or device.',"Guarda los originales, perfiles y álbumes en un ZIP. Puedes usarlo para trasladar el archivo a otro navegador o dispositivo."],
exportBackup:['Экспортировать ZIP','Export ZIP',"Exportar ZIP"],importBackup:['Восстановить из ZIP','Import ZIP',"Restaurar desde ZIP"],backupWarning:['Перед удалением Drawkeeper с экрана «Домой» сохраните ZIP в «Файлы». Удаление приложения, очистка данных сайта или потеря устройства могут привести к потере архива. Для обновления сохраните установленную иконку.','Before removing Drawkeeper from your Home Screen, export a ZIP to Files. Removing the app, clearing site data, or losing the device can erase the archive. Keep the installed icon when updating.',"Exporta una copia ZIP a Archivos. Si eliminas Drawkeeper, borras los datos del sitio o pierdes el dispositivo, podrías perder tu archivo. Conserva el icono instalado para las actualizaciones."],
importCheck:['Проверяем резервную копию…','Checking your backup…',"Comprobando la copia de seguridad…"],importConfirm:['Объединить с текущим архивом? Существующие записи и файлы останутся без изменений. Архив может дополнить их недостающими оригиналами.','Merge into this archive? Existing records and files will stay unchanged. The backup can fill in missing originals.',"¿Combinar con el archivo actual? Las fichas y los archivos existentes se conservarán. La copia puede recuperar los originales que falten."],merge:['Объединить','Merge',"Combinar"],imported:['Архив восстановлен','Archive restored',"Archivo restaurado"],invalidBackup:['Архив повреждён или имеет неподдерживаемый формат. Текущие данные не изменены.','The backup is damaged or unsupported. Your current data has not changed.',"La copia está dañada o su formato no es compatible. Tus datos se conservan."],
privacyTitle:['Личный — значит ваш','Private means yours',"Tu archivo es privado"],privacyBody:['Drawkeeper не отправляет ваши фотографии на сервер. Без рекламы, аналитики и облачной синхронизации. Оригиналы сохраняются независимо от медиатеки.','Drawkeeper does not send your photos to a server. No advertising, analytics, or cloud sync. Originals are kept independently of your photo library.',"Drawkeeper guarda las fotos en tu dispositivo. No incluye publicidad, análisis ni sincronización en la nube. Los originales se conservan de forma independiente de la fototeca."],
webNote:['Веб-версия для проверки продукта. Системный сканер iPhone и покупки App Store появятся при адаптации в нативное iOS-приложение.','Web version for testing the product. The iPhone document scanner and App Store purchases belong to the native iOS adaptation.',"Esta es la versión web. El escáner de documentos del iPhone y las compras en App Store corresponden a la versión nativa para iOS."],
language:['Язык приложения','App language',"Idioma de la aplicación"],back:['Назад','Back',"Atrás"],workCount:['работ','artworks',"obras"],years:['лет','years',"años"],months:['мес.','months',"meses"],download:['Скачать','Download',"Descargar"],working:['Пожалуйста, подождите…','Please wait…',"Espera un momento…"],discard:['Не сохранять изменения?','Discard unsaved changes?',"¿Descartar los cambios sin guardar?"],
demoReset:['Перейти к своему архиву','Go to my archive',"Ir a mi archivo"],allPages:['страниц, включая обложку','pages, including the cover',"páginas, incluida la portada"],zoom:['Увеличить фотографию','Zoom photo',"Ampliar foto"],previous:['Предыдущее фото','Previous photo',"Foto anterior"],next:['Следующее фото','Next photo',"Foto siguiente"],
moveUp:['Выше','Move up',"Mover hacia arriba"],moveDown:['Ниже','Move down',"Mover hacia abajo"],selectAll:['Выбрать все','Select all',"Seleccionar todo"],emptyProfile:['Создайте профиль ребёнка','Create a child profile',"Crea un perfil infantil"],forChild:['Коллекция','Collection',"Colección"],onlyLocal:['Остаётся только у вас','It stays with you',"Solo en tu dispositivo"],storageError:['Хранилище браузера недоступно. Откройте сайт в обычном окне браузера и разрешите хранение данных.','Browser storage is unavailable. Open the site in a regular browser window and allow site data.',"El almacenamiento del navegador no está disponible. Abre el sitio en una ventana normal y permite guardar datos."],
backupDone:['Резервная копия подготовлена','Backup is ready',"La copia de seguridad está lista"],profileSaved:['Профиль сохранён','Profile saved',"Perfil guardado"],demoChanges:['Изменение в демо-коллекции','Demo collection updated',"Colección de muestra actualizada"],addToAlbumTitle:['Добавить работу в альбом','Add artwork to an album',"Añadir obra a un álbum"],
photoHint:['Оригинал хранится отдельно. Поворот не изменяет исходную фотографию.','The original is kept separately. Rotation never changes the original photo.',"El original se guarda por separado. Girar la foto no modifica el archivo original."],
cropInstructions:['Перемещайте рамку или потяните за угол. Разведите два пальца для увеличения.','Drag the frame or a corner. Spread two fingers to zoom in.',"Arrastra el marco o una esquina. Separa dos dedos para ampliar."],
cropLegacy:['Эта фотография была обработана раньше. Новую рамку можно выбрать на оригинале.','This photo has an earlier edit. Choose a new crop on the original.',"Esta foto ya tiene una edición. El nuevo recorte se aplica sobre la foto original."],
cropDone:['Готово','Done',"Listo"],cropSkip:['Пропустить','Skip',"Omitir"],cropReset:['Сбросить','Reset',"Restablecer"],
enhance:['Улучшить','Enhance','Mejorar'],
zoomIn:['Увеличить','Zoom in',"Acercar"],zoomOut:['Уменьшить','Zoom out',"Alejar"],
crop:['Обрезать','Crop',"Recortar"],apply:['Применить','Apply',"Aplicar"],cropHint:['Потяните рамку на фотографии. Оригинал сохранится.','Drag a rectangle on the photo. The original is preserved.',"Dibuja un rectángulo sobre la foto. Se conserva el original."],
noAlbum:['Для этого ребёнка пока нет альбомов.','This child has no albums yet.',"Todavía no hay álbumes para este perfil."],busyClose:['Дождитесь окончания операции.','Please wait for the operation to finish.',"Espera a que termine la operación."],
syncNotice:['Архив изменился в другой вкладке. Обновите страницу перед сохранением.','The archive changed in another tab. Reload before saving.',"El archivo cambió en otra pestaña. Vuelve a cargar la página antes de guardar."]
};
export const t=(key,language=lang)=>words[key]?.[translationIndex[language]]??key;
export function localizeDocument(){
  document.documentElement.lang=lang;
  document.title=appName+' · '+t('tagline');
  document.querySelector('meta[name="description"]').content=t('tagline')+' '+t('welcomeFirst');
}
const locales={ru:'ru-RU',en:'en-GB',es:'es-ES'};
export const dateText=s=>{
  const date=new Date(s+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==s)return t('invalidCalendarDate');
  return new Intl.DateTimeFormat(locales[lang],{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
};
const russianForm=(n,one,few,many)=>{
  const last=n%10,lastTwo=n%100;
  if(last===1&&lastTwo!==11)return one;
  return last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?few:many;
};
export function periodText(n){
  const upper=n+1;
  const unit=lang==='ru'?russianForm(upper,'год','года','лет'):
    lang==='es'?(upper===1?'año':'años'):(upper===1?'year':'years');
  return `${n}–${upper} ${unit}`;
}
export function countText(n){
  const unit=lang==='ru'?russianForm(n,'работа','работы','работ'):
    lang==='es'?(n===1?'obra':'obras'):(n===1?'artwork':'artworks');
  return `${n} ${unit}`;
}
export function ageText(age){
  if(!age)return '';
  const {years,months}=age;
  const [yearUnit,monthUnit,infant]=lang==='ru'?[russianForm(years,'год','года','лет'),'мес.','Меньше месяца']:
    lang==='es'?[years===1?'año':'años',months===1?'mes':'meses','Menos de un mes']:
      [years===1?'year':'years',months===1?'month':'months','Under 1 month'];
  return [years?`${years} ${yearUnit}`:'',months?`${months} ${monthUnit}`:''].filter(Boolean).join(' ')||infant;
}
