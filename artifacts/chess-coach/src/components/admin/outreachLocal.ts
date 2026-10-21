// Club outreach in the club's own language: the "Introduce ChessScout.net"
// email translated into each language the app speaks. {{org}} {{sender}}
// {{address}} are filled in by the panel; LINK becomes the tracked link with
// ?lang= so the site opens in the same language.

export interface LocalIntro {
  /** Shown in the language picker. */
  label: string;
  /** Greeting for one club ({{org}}) and for a Bcc batch. */
  greet: string; greetAll: string;
  subject: string; subjectAll: string;
  body: string;
  thanks: string;
  optout: string;
}

export const LOCAL_INTROS: Record<string, LocalIntro> = {
  es: {
    label: 'Español',
    greet: 'Hola, equipo de {{org}}:', greetAll: 'Hola:',
    subject: 'Una herramienta de ajedrez gratuita para los jugadores de {{org}}', subjectAll: 'Una herramienta de ajedrez gratuita para los jugadores de su club',
    body: `Soy {{sender}} y desarrollo ChessScout.net, una web y app de ajedrez para jugadores de club, ahora disponible por completo en español. Creo que puede ser útil para sus miembros.

En ChessScout.net los jugadores pueden:
- jugar partidas en vivo contra rivales reales, o contra bots de su nivel con análisis en vivo
- revisar cada partida jugada a jugada, también sus partidas de Chess.com y Lichess
- organizar torneos en línea gratuitos para el club en un minuto
- empezar desde cero con el Camino del principiante y traer a sus hijos con Ajedrez para niños

Es gratis para empezar: LINK

Si le parece útil, le agradecería mucho que lo compartiera con sus jugadores. También me encantaría saber qué le gustaría a su club de una web como esta.`,
    thanks: 'Gracias,', optout: 'Si prefiere no recibir más correos míos, responda «no, gracias» y no volveré a escribirle.',
  },
  pt: {
    label: 'Português',
    greet: 'Olá, equipe do {{org}},', greetAll: 'Olá,',
    subject: 'Uma ferramenta de xadrez gratuita para os jogadores do {{org}}', subjectAll: 'Uma ferramenta de xadrez gratuita para os jogadores do seu clube',
    body: `Sou {{sender}} e desenvolvo o ChessScout.net, um site e app de xadrez para jogadores de clube, agora totalmente em português. Acho que pode ser útil para os seus membros.

No ChessScout.net os jogadores podem:
- jogar partidas ao vivo contra adversários reais, ou contra bots do seu nível com análise ao vivo
- revisar cada partida lance a lance, inclusive as partidas do Chess.com e do Lichess
- criar torneios on-line gratuitos para o clube em um minuto
- começar do zero com o Caminho do Iniciante e trazer os filhos com o Xadrez para Crianças

É gratuito para começar: LINK

Se fizer sentido, ficaria muito grato se você compartilhasse com seus jogadores. Também adoraria saber o que o seu clube gostaria de ter num site como este.`,
    thanks: 'Obrigado,', optout: 'Se preferir não receber mais e-mails meus, responda "não, obrigado" e não voltarei a escrever.',
  },
  fr: {
    label: 'Français',
    greet: "Bonjour à l'équipe de {{org}},", greetAll: 'Bonjour,',
    subject: "Un outil d'échecs gratuit pour les joueurs de {{org}}", subjectAll: "Un outil d'échecs gratuit pour les joueurs de votre club",
    body: `Je m'appelle {{sender}} et je développe ChessScout.net, un site et une appli d'échecs pour les joueurs de club, désormais entièrement en français. Je pense qu'il pourrait être utile à vos membres.

Sur ChessScout.net, les joueurs peuvent :
- jouer des parties en direct contre de vrais adversaires, ou contre des bots à leur niveau avec analyse en direct
- revoir chaque partie coup par coup, y compris leurs parties Chess.com et Lichess
- organiser des tournois en ligne gratuits pour le club en une minute
- débuter avec le Parcours débutant et faire jouer leurs enfants avec Échecs pour enfants

C'est gratuit pour commencer : LINK

Si cela vous semble utile, je vous serais reconnaissant de le partager avec vos joueurs. J'aimerais aussi beaucoup savoir ce que votre club attendrait d'un site comme celui-ci.`,
    thanks: 'Merci,', optout: 'Si vous préférez ne plus recevoir de messages de ma part, répondez simplement « non merci » et je ne vous écrirai plus.',
  },
  de: {
    label: 'Deutsch',
    greet: 'Hallo {{org}},', greetAll: 'Hallo,',
    subject: 'Ein kostenloses Schach-Tool für die Spieler von {{org}}', subjectAll: 'Ein kostenloses Schach-Tool für die Spieler Ihres Vereins',
    body: `ich bin {{sender}} und entwickle ChessScout.net, eine Schach-Website und App für Vereinsspieler, jetzt komplett auf Deutsch. Ich glaube, sie könnte für Ihre Mitglieder nützlich sein.

Auf ChessScout.net können Spieler:
- live gegen echte Gegner spielen oder gegen Bots auf ihrem Niveau mit Live-Analyse
- jede Partie Zug für Zug auswerten, auch ihre Partien von Chess.com und Lichess
- in einer Minute kostenlose Online-Turniere für den Verein anlegen
- mit dem Anfängerpfad bei null anfangen und ihre Kinder mit Schach für Kinder mitbringen

Der Einstieg ist kostenlos: LINK

Wenn es für Sie passt, würde ich mich sehr freuen, wenn Sie es mit Ihren Spielern teilen. Ich würde auch gern hören, was sich Ihr Verein von so einer Seite wünscht.`,
    thanks: 'Vielen Dank', optout: 'Wenn Sie keine weiteren E-Mails von mir möchten, antworten Sie einfach mit „Nein danke“, dann schreibe ich Ihnen nicht mehr.',
  },
  it: {
    label: 'Italiano',
    greet: 'Ciao a tutto il team di {{org}},', greetAll: 'Buongiorno,',
    subject: 'Uno strumento di scacchi gratuito per i giocatori di {{org}}', subjectAll: 'Uno strumento di scacchi gratuito per i giocatori del vostro circolo',
    body: `Sono {{sender}} e sviluppo ChessScout.net, un sito e un'app di scacchi per giocatori di circolo, ora interamente in italiano. Penso che possa essere utile ai vostri soci.

Su ChessScout.net i giocatori possono:
- giocare partite dal vivo contro avversari veri, o contro bot del loro livello con analisi dal vivo
- rivedere ogni partita mossa per mossa, comprese le partite di Chess.com e Lichess
- creare in un minuto tornei online gratuiti per il circolo
- partire da zero con il Percorso principianti e coinvolgere i figli con Scacchi per bambini

Iniziare è gratis: LINK

Se vi sembra utile, vi sarei grato se lo condivideste con i vostri giocatori. Mi farebbe anche piacere sapere cosa vorrebbe il vostro circolo da un sito come questo.`,
    thanks: 'Grazie,', optout: 'Se preferite non ricevere altre email da me, rispondete "no grazie" e non vi scriverò più.',
  },
  nl: {
    label: 'Nederlands',
    greet: 'Hallo {{org}},', greetAll: 'Hallo,',
    subject: 'Een gratis schaaktool voor de spelers van {{org}}', subjectAll: 'Een gratis schaaktool voor de spelers van jullie club',
    body: `Ik ben {{sender}} en ik bouw ChessScout.net, een schaaksite en -app voor clubspelers, nu volledig in het Nederlands. Ik denk dat het nuttig kan zijn voor jullie leden.

Op ChessScout.net kunnen spelers:
- live partijen spelen tegen echte tegenstanders, of tegen bots op hun niveau met live analyse
- elke partij zet voor zet laten analyseren, ook hun partijen van Chess.com en Lichess
- in een minuut gratis online toernooien voor de club opzetten
- vanaf nul beginnen met het Beginnerspad en hun kinderen meenemen met Schaken voor kinderen

Gratis om te beginnen: LINK

Als het nuttig lijkt, zou ik het erg waarderen als jullie het met jullie spelers delen. Ik hoor ook graag wat jullie club van zo'n site zou willen.`,
    thanks: 'Bedankt,', optout: 'Wil je liever geen e-mails meer van mij? Antwoord dan gewoon "nee bedankt" en ik mail je niet meer.',
  },
  pl: {
    label: 'Polski',
    greet: 'Dzień dobry, zespole {{org}},', greetAll: 'Dzień dobry,',
    subject: 'Darmowe narzędzie szachowe dla zawodników {{org}}', subjectAll: 'Darmowe narzędzie szachowe dla zawodników Państwa klubu',
    body: `Nazywam się {{sender}} i tworzę ChessScout.net, stronę i aplikację szachową dla zawodników klubowych, teraz w pełni po polsku. Myślę, że może się przydać Państwa członkom.

Na ChessScout.net zawodnicy mogą:
- grać partie na żywo z prawdziwymi przeciwnikami albo z botami na swoim poziomie z analizą na żywo
- analizować każdą partię ruch po ruchu, także partie z Chess.com i Lichess
- w minutę utworzyć darmowy turniej online dla klubu
- zacząć od zera ze Ścieżką początkującego, a dzieci przyprowadzić do Szachów dla dzieci

Na start jest za darmo: LINK

Jeśli wyda się to przydatne, będę wdzięczny za przekazanie informacji zawodnikom. Chętnie też usłyszę, czego Państwa klub oczekiwałby od takiej strony.`,
    thanks: 'Dziękuję,', optout: 'Jeśli nie chcą Państwo więcej wiadomości ode mnie, wystarczy odpisać „nie, dziękuję”, a więcej nie napiszę.',
  },
  uk: {
    label: 'Українська',
    greet: 'Вітаю, команда {{org}}!', greetAll: 'Вітаю!',
    subject: 'Безкоштовний шаховий інструмент для гравців {{org}}', subjectAll: 'Безкоштовний шаховий інструмент для гравців вашого клубу',
    body: `Мене звати {{sender}}, я розробляю ChessScout.net — шаховий сайт і застосунок для клубних гравців, тепер повністю українською. Думаю, він може бути корисним вашим членам клубу.

На ChessScout.net гравці можуть:
- грати живі партії зі справжніми суперниками або з ботами свого рівня з аналізом наживо
- розбирати кожну партію хід за ходом, зокрема свої партії з Chess.com і Lichess
- за хвилину створити безкоштовний онлайн-турнір для клубу
- почати з нуля зі «Шляхом новачка» і привести дітей у «Шахи для дітей»

Почати можна безкоштовно: LINK

Якщо це вам корисно, буду вдячний, якщо поділитеся з гравцями. Також дуже хочу почути, чого ваш клуб чекає від такого сайту.`,
    thanks: 'Дякую,', optout: 'Якщо не хочете більше отримувати від мене листів, просто дайте відповідь «ні, дякую», і я більше не писатиму.',
  },
  tr: {
    label: 'Türkçe',
    greet: 'Merhaba {{org}} ekibi,', greetAll: 'Merhaba,',
    subject: '{{org}} oyuncuları için ücretsiz bir satranç aracı', subjectAll: 'Kulübünüzün oyuncuları için ücretsiz bir satranç aracı',
    body: `Ben {{sender}}, kulüp oyuncuları için bir satranç sitesi ve uygulaması olan ChessScout.net'i geliştiriyorum; artık tamamen Türkçe. Üyeleriniz için faydalı olabileceğini düşünüyorum.

ChessScout.net'te oyuncular:
- gerçek rakiplere karşı canlı oynayabilir ya da canlı analizli, seviyelerine uygun botlarla oynayabilir
- her oyunu hamle hamle inceleyebilir; Chess.com ve Lichess oyunları da dahil
- kulüp için bir dakikada ücretsiz çevrim içi turnuva düzenleyebilir
- Yeni Başlayan Yolu ile sıfırdan başlayabilir, çocuklarını da Çocuklar için Satranç ile getirebilir

Başlamak ücretsiz: LINK

Faydalı bulursanız oyuncularınızla paylaşmanızdan çok mutlu olurum. Kulübünüzün böyle bir siteden ne beklediğini duymayı da çok isterim.`,
    thanks: 'Teşekkürler,', optout: 'Benden başka e-posta almak istemezseniz "hayır, teşekkürler" diye yanıtlamanız yeterli, bir daha yazmam.',
  },
  ro: {
    label: 'Română',
    greet: 'Bună ziua, echipa {{org}},', greetAll: 'Bună ziua,',
    subject: 'Un instrument de șah gratuit pentru jucătorii {{org}}', subjectAll: 'Un instrument de șah gratuit pentru jucătorii clubului dumneavoastră',
    body: `Sunt {{sender}} și dezvolt ChessScout.net, un site și o aplicație de șah pentru jucătorii de club, acum complet în română. Cred că le-ar putea fi util membrilor dumneavoastră.

Pe ChessScout.net jucătorii pot:
- juca partide live cu adversari reali sau cu boți de nivelul lor, cu analiză live
- revedea fiecare partidă mutare cu mutare, inclusiv partidele de pe Chess.com și Lichess
- crea într-un minut turnee online gratuite pentru club
- începe de la zero cu Drumul începătorului și își pot aduce copiii la Șah pentru copii

Începutul e gratuit: LINK

Dacă vi se pare util, v-aș fi recunoscător dacă l-ați împărtăși jucătorilor. Mi-ar plăcea să aflu și ce și-ar dori clubul dumneavoastră de la un astfel de site.`,
    thanks: 'Mulțumesc,', optout: 'Dacă preferați să nu mai primiți e-mailuri de la mine, răspundeți „nu, mulțumesc” și nu vă mai scriu.',
  },
  cs: {
    label: 'Čeština',
    greet: 'Dobrý den, týme {{org}},', greetAll: 'Dobrý den,',
    subject: 'Bezplatný šachový nástroj pro hráče {{org}}', subjectAll: 'Bezplatný šachový nástroj pro hráče vašeho klubu',
    body: `jmenuji se {{sender}} a vyvíjím ChessScout.net, šachový web a aplikaci pro klubové hráče, nyní kompletně v češtině. Myslím, že by se mohl hodit vašim členům.

Na ChessScout.net mohou hráči:
- hrát živé partie se skutečnými soupeři nebo s boty na své úrovni s živou analýzou
- rozebrat každou partii tah po tahu, včetně partií z Chess.com a Lichess
- za minutu založit bezplatný online turnaj pro klub
- začít od nuly s Cestou začátečníka a vzít s sebou i děti díky Šachům pro děti

Začít je zdarma: LINK

Pokud vám to přijde užitečné, budu rád, když to sdílíte se svými hráči. Rád bych také slyšel, co by váš klub od takového webu chtěl.`,
    thanks: 'Děkuji,', optout: 'Pokud ode mě nechcete další e-maily, stačí odpovědět „ne, děkuji“ a už vám nenapíšu.',
  },
  hu: {
    label: 'Magyar',
    greet: 'Kedves {{org}} csapat!', greetAll: 'Jó napot!',
    subject: 'Ingyenes sakkeszköz a(z) {{org}} játékosainak', subjectAll: 'Ingyenes sakkeszköz a klubjuk játékosainak',
    body: `{{sender}} vagyok, a ChessScout.net fejlesztője. Ez egy sakkoldal és alkalmazás klubjátékosoknak, mostantól teljesen magyarul. Úgy gondolom, hasznos lehet a tagjaiknak.

A ChessScout.net-en a játékosok:
- élőben játszhatnak valódi ellenfelekkel, vagy a szintjüknek megfelelő botokkal élő elemzéssel
- lépésről lépésre elemezhetik minden játszmájukat, a Chess.com és Lichess játszmáikat is
- egy perc alatt ingyenes online versenyt rendezhetnek a klubnak
- a Kezdő ösvénnyel a nulláról indulhatnak, a gyerekeiket pedig a Sakk gyerekeknek részbe hozhatják

Ingyenesen el lehet kezdeni: LINK

Ha hasznosnak találják, hálás lennék, ha megosztanák a játékosaikkal. Szívesen hallanám azt is, mit szeretne a klubjuk egy ilyen oldaltól.`,
    thanks: 'Köszönettel:', optout: 'Ha nem szeretnének több levelet tőlem, csak válaszoljanak „köszönöm, nem” szöveggel, és többet nem írok.',
  },
  el: {
    label: 'Ελληνικά',
    greet: 'Γεια σας, ομάδα του {{org}},', greetAll: 'Γεια σας,',
    subject: 'Ένα δωρεάν εργαλείο σκακιού για τους παίκτες του {{org}}', subjectAll: 'Ένα δωρεάν εργαλείο σκακιού για τους παίκτες του συλλόγου σας',
    body: `Είμαι ο/η {{sender}} και φτιάχνω το ChessScout.net, έναν ιστότοπο και εφαρμογή σκακιού για παίκτες συλλόγων, πλέον εξ ολοκλήρου στα ελληνικά. Πιστεύω ότι μπορεί να φανεί χρήσιμο στα μέλη σας.

Στο ChessScout.net οι παίκτες μπορούν:
- να παίζουν ζωντανές παρτίδες με πραγματικούς αντιπάλους ή με bots στο επίπεδό τους με ζωντανή ανάλυση
- να αναλύουν κάθε παρτίδα κίνηση προς κίνηση, μαζί και τις παρτίδες τους από Chess.com και Lichess
- να δημιουργούν σε ένα λεπτό δωρεάν διαδικτυακά τουρνουά για τον σύλλογο
- να ξεκινούν από το μηδέν με τη Διαδρομή αρχαρίου και να φέρνουν τα παιδιά τους στο Σκάκι για παιδιά

Η αρχή είναι δωρεάν: LINK

Αν σας φαίνεται χρήσιμο, θα σας ήμουν ευγνώμων αν το μοιραζόσασταν με τους παίκτες σας. Θα ήθελα επίσης πολύ να μάθω τι θα ήθελε ο σύλλογός σας από έναν τέτοιο ιστότοπο.`,
    thanks: 'Ευχαριστώ,', optout: 'Αν προτιμάτε να μη λαμβάνετε άλλα email από εμένα, απαντήστε «όχι, ευχαριστώ» και δεν θα σας ξαναγράψω.',
  },
  sv: {
    label: 'Svenska',
    greet: 'Hej {{org}}!', greetAll: 'Hej!',
    subject: 'Ett gratis schackverktyg för spelarna i {{org}}', subjectAll: 'Ett gratis schackverktyg för spelarna i er klubb',
    body: `Jag heter {{sender}} och bygger ChessScout.net, en schacksajt och app för klubbspelare, nu helt på svenska. Jag tror att den kan vara användbar för era medlemmar.

På ChessScout.net kan spelare:
- spela livepartier mot riktiga motståndare, eller mot bottar på sin nivå med liveanalys
- få varje parti genomgånget drag för drag, även sina partier från Chess.com och Lichess
- skapa gratis onlineturneringar för klubben på en minut
- börja från noll med Nybörjarstigen och ta med barnen till Schack för barn

Det är gratis att börja: LINK

Om det verkar användbart skulle jag uppskatta om ni delade det med era spelare. Jag skulle också gärna höra vad er klubb skulle vilja ha från en sådan sajt.`,
    thanks: 'Tack,', optout: 'Om ni hellre inte vill ha fler mejl från mig, svara bara "nej tack" så hör jag inte av mig igen.',
  },
  ar: {
    label: 'العربية',
    greet: 'مرحبًا فريق {{org}}،', greetAll: 'مرحبًا،',
    subject: 'أداة شطرنج مجانية للاعبي {{org}}', subjectAll: 'أداة شطرنج مجانية للاعبي ناديكم',
    body: `أنا {{sender}}، وأطوّر ChessScout.net، موقع وتطبيق شطرنج للاعبي الأندية، وهو الآن متاح بالكامل باللغة العربية. أعتقد أنه قد يفيد أعضاء ناديكم.

على ChessScout.net يستطيع اللاعبون:
- لعب مباريات مباشرة ضد خصوم حقيقيين، أو ضد بوتات بمستواهم مع تحليل مباشر
- مراجعة كل مباراة نقلةً نقلة، بما في ذلك مبارياتهم على Chess.com وLichess
- إنشاء بطولات مجانية عبر الإنترنت للنادي في دقيقة واحدة
- البدء من الصفر مع مسار المبتدئ، وإحضار أطفالهم إلى الشطرنج للأطفال

البدء مجاني: LINK

إن وجدتموه مفيدًا، سأكون ممتنًا لو شاركتموه مع لاعبيكم. ويسعدني أيضًا أن أعرف ما الذي يريده ناديكم من موقع كهذا.`,
    thanks: 'شكرًا،', optout: 'إن كنتم تفضّلون عدم تلقي رسائل أخرى مني، يكفي الرد بعبارة «لا شكرًا» ولن أراسلكم مجددًا.',
  },
  fa: {
    label: 'فارسی',
    greet: 'سلام به تیم {{org}}،', greetAll: 'سلام،',
    subject: 'یک ابزار شطرنج رایگان برای بازیکنان {{org}}', subjectAll: 'یک ابزار شطرنج رایگان برای بازیکنان باشگاه شما',
    body: `من {{sender}} هستم و ChessScout.net را می‌سازم؛ سایت و اپ شطرنج برای بازیکنان باشگاهی که حالا کاملاً به فارسی است. فکر می‌کنم برای اعضای شما مفید باشد.

در ChessScout.net بازیکنان می‌توانند:
- با حریفان واقعی بازی زنده کنند یا با ربات‌های هم‌سطح خود همراه با تحلیل زنده بازی کنند
- هر بازی را حرکت به حرکت مرور کنند، از جمله بازی‌هایشان در Chess.com و Lichess
- در یک دقیقه برای باشگاه مسابقه آنلاین رایگان بسازند
- با مسیر مبتدی از صفر شروع کنند و بچه‌هایشان را به شطرنج برای کودکان بیاورند

شروع رایگان است: LINK

اگر به نظرتان مفید است، ممنون می‌شوم آن را با بازیکنانتان به اشتراک بگذارید. دوست دارم بدانم باشگاه شما از چنین سایتی چه می‌خواهد.`,
    thanks: 'با سپاس،', optout: 'اگر ترجیح می‌دهید دیگر از من ایمیلی دریافت نکنید، فقط بنویسید «نه، ممنون» و دیگر برایتان نمی‌نویسم.',
  },
  hi: {
    label: 'हिन्दी',
    greet: 'नमस्ते {{org}} टीम,', greetAll: 'नमस्ते,',
    subject: '{{org}} के खिलाड़ियों के लिए एक मुफ़्त शतरंज टूल', subjectAll: 'आपके क्लब के खिलाड़ियों के लिए एक मुफ़्त शतरंज टूल',
    body: `मैं {{sender}} हूँ और ChessScout.net बनाता हूँ, क्लब खिलाड़ियों के लिए शतरंज की वेबसाइट और ऐप, जो अब पूरी तरह हिंदी में है। मुझे लगता है कि यह आपके सदस्यों के काम आ सकता है।

ChessScout.net पर खिलाड़ी:
- असली विरोधियों के साथ लाइव खेल सकते हैं, या लाइव विश्लेषण के साथ अपने स्तर के बॉट से खेल सकते हैं
- हर गेम को चाल-दर-चाल देख सकते हैं, Chess.com और Lichess के गेम भी
- एक मिनट में क्लब के लिए मुफ़्त ऑनलाइन टूर्नामेंट बना सकते हैं
- बिगिनर पाथ से शून्य से शुरू कर सकते हैं और बच्चों को बच्चों के लिए शतरंज में ला सकते हैं

शुरू करना मुफ़्त है: LINK

अगर यह उपयोगी लगे, तो अपने खिलाड़ियों के साथ साझा करें, मैं आभारी रहूँगा। मैं यह भी जानना चाहूँगा कि आपका क्लब ऐसी साइट से क्या चाहता है।`,
    thanks: 'धन्यवाद,', optout: 'अगर आप मुझसे और ईमेल नहीं चाहते, तो बस "नहीं, धन्यवाद" लिखकर जवाब दें, मैं दोबारा ईमेल नहीं करूँगा।',
  },
  bn: {
    label: 'বাংলা',
    greet: 'নমস্কার {{org}} টিম,', greetAll: 'নমস্কার,',
    subject: '{{org}}-এর খেলোয়াড়দের জন্য একটি বিনামূল্যের দাবা টুল', subjectAll: 'আপনার ক্লাবের খেলোয়াড়দের জন্য একটি বিনামূল্যের দাবা টুল',
    body: `আমি {{sender}}, ChessScout.net তৈরি করি—ক্লাব খেলোয়াড়দের জন্য একটি দাবা সাইট ও অ্যাপ, যা এখন পুরোপুরি বাংলায়। আমার মনে হয় এটি আপনার সদস্যদের কাজে আসবে।

ChessScout.net-এ খেলোয়াড়রা:
- আসল প্রতিপক্ষের সঙ্গে লাইভ খেলতে পারেন, বা লাইভ বিশ্লেষণসহ নিজের মানের বটের সঙ্গে খেলতে পারেন
- প্রতিটি গেম চাল ধরে ধরে দেখতে পারেন, Chess.com ও Lichess-এর গেমও
- এক মিনিটে ক্লাবের জন্য বিনামূল্যে অনলাইন টুর্নামেন্ট তৈরি করতে পারেন
- বিগিনার পাথ দিয়ে শূন্য থেকে শুরু করতে পারেন, আর সন্তানদের শিশুদের জন্য দাবায় আনতে পারেন

শুরু করা বিনামূল্যে: LINK

কাজের মনে হলে আপনার খেলোয়াড়দের সঙ্গে শেয়ার করলে কৃতজ্ঞ থাকব। আপনার ক্লাব এমন একটি সাইট থেকে কী চায়, তাও জানতে চাই।`,
    thanks: 'ধন্যবাদ,', optout: 'আমার কাছ থেকে আর ইমেল না চাইলে শুধু "না, ধন্যবাদ" লিখে উত্তর দিন, আর লিখব না।',
  },
  id: {
    label: 'Bahasa Indonesia',
    greet: 'Halo tim {{org}},', greetAll: 'Halo,',
    subject: 'Alat catur gratis untuk para pemain {{org}}', subjectAll: 'Alat catur gratis untuk para pemain klub Anda',
    body: `Saya {{sender}}, pembuat ChessScout.net, situs dan aplikasi catur untuk pemain klub yang kini sepenuhnya berbahasa Indonesia. Saya rasa ini bisa bermanfaat bagi anggota Anda.

Di ChessScout.net pemain bisa:
- main live melawan lawan sungguhan, atau melawan bot sesuai levelnya dengan analisis live
- meninjau setiap permainan langkah demi langkah, termasuk permainan mereka di Chess.com dan Lichess
- membuat turnamen online gratis untuk klub dalam satu menit
- mulai dari nol dengan Jalur Pemula, dan mengajak anak lewat Catur untuk Anak

Gratis untuk mulai: LINK

Kalau bermanfaat, saya akan sangat berterima kasih jika Anda membagikannya kepada para pemain. Saya juga ingin tahu apa yang klub Anda harapkan dari situs seperti ini.`,
    thanks: 'Terima kasih,', optout: 'Jika Anda tidak ingin menerima email dari saya lagi, cukup balas "tidak, terima kasih" dan saya tidak akan mengirim email lagi.',
  },
  vi: {
    label: 'Tiếng Việt',
    greet: 'Xin chào đội ngũ {{org}},', greetAll: 'Xin chào,',
    subject: 'Công cụ cờ vua miễn phí cho kỳ thủ của {{org}}', subjectAll: 'Công cụ cờ vua miễn phí cho kỳ thủ của câu lạc bộ bạn',
    body: `Tôi là {{sender}}, người phát triển ChessScout.net, trang web và ứng dụng cờ vua cho kỳ thủ câu lạc bộ, nay đã có đầy đủ tiếng Việt. Tôi nghĩ nó có thể hữu ích cho các thành viên của bạn.

Trên ChessScout.net, kỳ thủ có thể:
- chơi trực tiếp với đối thủ thật, hoặc với bot đúng trình độ kèm phân tích trực tiếp
- xem lại từng ván theo từng nước, kể cả các ván trên Chess.com và Lichess
- tạo giải đấu trực tuyến miễn phí cho câu lạc bộ trong một phút
- bắt đầu từ con số không với Lộ trình cho người mới, và đưa con em đến với Cờ vua cho bé

Bắt đầu miễn phí: LINK

Nếu thấy hữu ích, tôi rất cảm ơn nếu bạn chia sẻ với các kỳ thủ. Tôi cũng rất muốn biết câu lạc bộ của bạn mong muốn gì ở một trang như thế này.`,
    thanks: 'Cảm ơn bạn,', optout: 'Nếu bạn không muốn nhận thêm email từ tôi, chỉ cần trả lời "không, cảm ơn" và tôi sẽ không gửi nữa.',
  },
  th: {
    label: 'ไทย',
    greet: 'สวัสดีทีมงาน {{org}}', greetAll: 'สวัสดีครับ',
    subject: 'เครื่องมือหมากรุกฟรีสำหรับนักหมากรุกของ {{org}}', subjectAll: 'เครื่องมือหมากรุกฟรีสำหรับนักหมากรุกในชมรมของคุณ',
    body: `ผม {{sender}} ผู้พัฒนา ChessScout.net เว็บไซต์และแอปหมากรุกสำหรับนักหมากรุกในชมรม ตอนนี้มีภาษาไทยครบทั้งแอปแล้ว ผมคิดว่าน่าจะเป็นประโยชน์กับสมาชิกของคุณ

บน ChessScout.net ผู้เล่นสามารถ:
- เล่นสดกับคู่แข่งตัวจริง หรือเล่นกับบอทระดับเดียวกันพร้อมการวิเคราะห์สด
- ทบทวนทุกเกมทีละตา รวมถึงเกมจาก Chess.com และ Lichess
- สร้างทัวร์นาเมนต์ออนไลน์ฟรีให้ชมรมได้ในหนึ่งนาที
- เริ่มจากศูนย์ด้วยเส้นทางมือใหม่ และพาลูก ๆ มาเล่นหมากรุกสำหรับเด็ก

เริ่มใช้ฟรี: LINK

ถ้าเห็นว่ามีประโยชน์ ผมจะขอบคุณมากถ้าช่วยแชร์ให้ผู้เล่นของคุณ และอยากทราบด้วยว่าชมรมของคุณอยากได้อะไรจากเว็บไซต์แบบนี้`,
    thanks: 'ขอบคุณครับ', optout: 'หากไม่ต้องการรับอีเมลจากผมอีก เพียงตอบกลับว่า "ไม่ ขอบคุณ" แล้วผมจะไม่ส่งมาอีก',
  },
  tl: {
    label: 'Filipino',
    greet: 'Kumusta, {{org}} team,', greetAll: 'Kumusta,',
    subject: 'Libreng chess tool para sa mga manlalaro ng {{org}}', subjectAll: 'Libreng chess tool para sa mga manlalaro ng inyong club',
    body: `Ako si {{sender}}, at gumagawa ako ng ChessScout.net, isang chess site at app para sa mga club player, na buo nang nasa Filipino. Sa tingin ko makakatulong ito sa inyong mga miyembro.

Sa ChessScout.net, ang mga manlalaro ay puwedeng:
- maglaro nang live laban sa totoong kalaban, o laban sa mga bot na kapantay nila na may live analysis
- suriin ang bawat laro nang isa-isang tira, pati ang mga laro nila sa Chess.com at Lichess
- gumawa ng libreng online tournament para sa club sa loob ng isang minuto
- magsimula sa umpisa gamit ang Beginner Path, at isama ang mga anak sa Chess para sa Bata

Libre ang pagsisimula: LINK

Kung sa tingin ninyo ay makakatulong ito, lubos akong magpapasalamat kung ibabahagi ninyo ito sa inyong mga manlalaro. Gusto ko ring malaman kung ano ang gusto ng inyong club sa ganitong site.`,
    thanks: 'Salamat,', optout: 'Kung ayaw na ninyong makatanggap ng email mula sa akin, sumagot lang ng "hindi, salamat" at hindi na ako mag-e-email.',
  },
  'zh-CN': {
    label: '简体中文',
    greet: '{{org}} 团队，您好：', greetAll: '您好：',
    subject: '一款免费的国际象棋工具，送给 {{org}} 的棋手', subjectAll: '一款免费的国际象棋工具，送给贵俱乐部的棋手',
    body: `我是 {{sender}}，正在开发 ChessScout.net，一个面向俱乐部棋手的国际象棋网站和应用，现已全面支持中文。我想它可能对贵俱乐部的成员有帮助。

在 ChessScout.net 上，棋手可以：
- 与真实对手实时对弈，或与水平相当、带实时分析的陪练机器人对弈
- 逐步复盘每一盘棋，包括他们在 Chess.com 和 Lichess 上的对局
- 一分钟内为俱乐部创建免费的线上比赛
- 从零开始学习新手之路，并让孩子使用儿童国际象棋

免费开始：LINK

如果您觉得有用，非常感谢您分享给俱乐部的棋手。我也很想了解贵俱乐部希望这样的网站提供什么。`,
    thanks: '谢谢，', optout: '如果您不希望再收到我的邮件，只需回复“不用了，谢谢”，我将不再打扰。',
  },
  'zh-TW': {
    label: '繁體中文',
    greet: '{{org}} 團隊，您好：', greetAll: '您好：',
    subject: '一款免費的西洋棋工具，送給 {{org}} 的棋手', subjectAll: '一款免費的西洋棋工具，送給貴俱樂部的棋手',
    body: `我是 {{sender}}，正在開發 ChessScout.net，一個專為俱樂部棋手打造的西洋棋網站和 App，現已全面支援中文。我想它可能對貴俱樂部的成員有幫助。

在 ChessScout.net 上，棋手可以：
- 與真實對手即時對弈，或與程度相當、具備即時分析的陪練機器人對弈
- 逐步復盤每一盤棋，包括他們在 Chess.com 和 Lichess 上的對局
- 一分鐘內為俱樂部建立免費的線上比賽
- 從零開始學習新手之路，並讓孩子使用兒童西洋棋

免費開始：LINK

如果您覺得有用，非常感謝您分享給俱樂部的棋手。我也很想了解貴俱樂部希望這樣的網站提供什麼。`,
    thanks: '謝謝，', optout: '如果您不希望再收到我的郵件，只需回覆「不用了，謝謝」，我將不再打擾。',
  },
  ja: {
    label: '日本語',
    greet: '{{org}} ご担当者様', greetAll: 'ご担当者様',
    subject: '{{org}} の皆さまへ：無料のチェスツールのご紹介', subjectAll: 'クラブの皆さまへ：無料のチェスツールのご紹介',
    body: `{{sender}} と申します。クラブプレイヤー向けのチェスサイト・アプリ ChessScout.net を開発しており、このたび日本語に完全対応しました。会員の皆さまのお役に立てるのではと思い、ご連絡しました。

ChessScout.net では次のことができます。
- 本物の相手とライブ対局、またはライブ分析つきで自分のレベルに合ったボットと対局
- すべての対局を1手ずつ振り返り（Chess.com や Lichess の対局も対応）
- クラブ向けの無料オンライン大会を1分で作成
- ビギナーパスでゼロから学び、お子さまはキッズチェスで一緒に楽しめます

無料で始められます：LINK

お役に立ちそうでしたら、会員の皆さまにご共有いただけると大変うれしいです。このようなサイトにクラブとして何を求めるか、ぜひお聞かせください。`,
    thanks: 'よろしくお願いいたします。', optout: '今後のご連絡が不要な場合は「不要です」とご返信ください。以後ご連絡いたしません。',
  },
  ko: {
    label: '한국어',
    greet: '{{org}} 담당자님께', greetAll: '안녕하세요,',
    subject: '{{org}} 회원을 위한 무료 체스 도구', subjectAll: '클럽 회원을 위한 무료 체스 도구',
    body: `안녕하세요, 클럽 플레이어를 위한 체스 사이트이자 앱인 ChessScout.net을 만들고 있는 {{sender}}입니다. 이제 한국어를 완전히 지원하게 되어, 회원분들께 도움이 될 것 같아 연락드립니다.

ChessScout.net에서는 다음을 할 수 있습니다.
- 실제 상대와 실시간 대국, 또는 실시간 분석이 있는 수준별 봇과 대국
- 모든 대국을 한 수씩 복기 (Chess.com, Lichess 대국 포함)
- 1분 만에 클럽용 무료 온라인 대회 만들기
- 비기너 패스로 처음부터 배우고, 자녀는 키즈 체스로 함께

무료로 시작할 수 있습니다: LINK

도움이 될 것 같다면 회원분들께 공유해 주시면 정말 감사하겠습니다. 클럽에서 이런 사이트에 무엇을 바라시는지도 꼭 듣고 싶습니다.`,
    thanks: '감사합니다.', optout: '더 이상 메일을 원하지 않으시면 "괜찮습니다"라고 답장해 주세요. 다시 연락드리지 않겠습니다.',
  },
};
