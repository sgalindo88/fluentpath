/* ═══════════════════════════════════════════════════════════════
   FluentPath — Stand-by lessons for beginners (A1 and A2)
   ─────────────────────────────────────────────────────────────
   Used ONLY when the lesson generator is unavailable AND the shared
   Lesson Library has no lesson for the student's level. Higher levels use
   the built-in lessons in student-lesson.js.

   Each lesson has the same shape as a generated one, with a Spanish line
   (`*_es` keys) for every text a student reads, as the generator produces
   for A1 and A2. Vocabulary words, listening text, answer options and
   speaking phrases stay English: that is what is being learned.
   The Spanish copy is Claude's and needs a native-speaker read.
   ═══════════════════════════════════════════════════════════════ */

var FP = window.FP || {};
window.FP = FP;

FP.fallbackLessons = {
  A1: [
    // ── 0: Hello, my name is… ──
    {
      topic: 'Hello! My Name Is…',
      topic_es: '¡Hola! Me llamo…',
      objective: 'Say hello, give your name and say where you are from.',
      objective_es: 'Saludar, decir tu nombre y decir de dónde eres.',
      warmup: {
        title: 'Say Hello',
        title_es: 'Saluda',
        instruction: 'Think about how you say hello to a new person. Answer in English, even with one or two words.',
        instruction_es:
          'Piensa cómo saludas a una persona nueva. Responde en inglés, aunque sea con una o dos palabras.',
        prompt: 'How do you say hello? What is your name?',
        prompt_es: '¿Cómo saludas? ¿Cómo te llamas?',
      },
      vocabulary: {
        title: 'Hello Words',
        title_es: 'Palabras para saludar',
        instruction: 'Tap each word to see its meaning. Then say it out loud.',
        instruction_es: 'Toca cada palabra para ver su significado. Luego dila en voz alta.',
        words: [
          {
            word: 'hello',
            pronunciation: '/həˈloʊ/',
            partOfSpeech: 'interjection',
            definition: 'What you say when you meet someone',
            definition_es: 'Lo que dices cuando conoces a alguien',
            exampleSentence: 'Hello, I am Ana.',
            exampleSentence_es: 'Hola, soy Ana.',
          },
          {
            word: 'name',
            pronunciation: '/neɪm/',
            partOfSpeech: 'noun',
            definition: 'The word people call you',
            definition_es: 'La palabra con la que te llaman',
            exampleSentence: 'My name is Luis.',
            exampleSentence_es: 'Me llamo Luis.',
          },
          {
            word: 'from',
            pronunciation: '/frʌm/',
            partOfSpeech: 'preposition',
            definition: 'The place where you were born or live before',
            definition_es: 'El lugar donde naciste o donde vivías antes',
            exampleSentence: 'I am from Mexico.',
            exampleSentence_es: 'Soy de México.',
          },
          {
            word: 'nice',
            pronunciation: '/naɪs/',
            partOfSpeech: 'adjective',
            definition: 'Good and pleasant',
            definition_es: 'Bueno y agradable',
            exampleSentence: 'Nice to meet you.',
            exampleSentence_es: 'Mucho gusto.',
          },
        ],
      },
      listening: {
        title: 'Meeting Someone',
        title_es: 'Conocer a alguien',
        instruction: 'Listen to the short talk. Then answer the questions.',
        instruction_es: 'Escucha la conversación corta. Luego responde las preguntas.',
        audioText: 'Hello. My name is Rosa. I am from Colombia. I live in Toronto. Nice to meet you.',
        questions: [
          {
            id: 'l1',
            question: 'What is her name?',
            question_es: '¿Cómo se llama ella?',
            options: ['Rosa', 'Ana', 'Maria', 'Luisa'],
            correct: 0,
          },
          {
            id: 'l2',
            question: 'Where is she from?',
            question_es: '¿De dónde es ella?',
            options: ['Mexico', 'Colombia', 'Canada', 'Peru'],
            correct: 1,
          },
        ],
      },
      speaking: {
        title: 'Say It Out Loud',
        title_es: 'Dilo en voz alta',
        instruction: 'Repeat each phrase slowly and clearly.',
        instruction_es: 'Repite cada frase despacio y con claridad.',
        drills: [
          {
            id: 's1',
            phrase: 'Hello, my name is Ana.',
            tip: 'Say "my name is" smoothly: my-NAME-is.',
            tip_es: 'Di "my name is" de corrido: my-NAME-is.',
          },
          {
            id: 's2',
            phrase: 'Nice to meet you.',
            tip: 'Make "meet" long: MEEEET.',
            tip_es: 'Alarga la palabra "meet": MIIIT.',
          },
        ],
        conversationPrompt: 'Record yourself: say hello, say your name and say where you are from.',
        conversationPrompt_es: 'Grábate: saluda, di tu nombre y di de dónde eres.',
      },
      practice: {
        title: 'Quick Check',
        title_es: 'Repaso rápido',
        instruction: 'Choose the best answer.',
        instruction_es: 'Elige la mejor respuesta.',
        questions: [
          {
            id: 'p1',
            question: 'Someone says "Hello!" What do you say?',
            question_es: 'Alguien dice "Hello!" ¿Qué dices?',
            options: ['Hello!', 'Goodbye.', 'Thank you.', 'Sorry.'],
            correct: 0,
          },
          {
            id: 'p2',
            question: 'Complete: "My ____ is Ana."',
            question_es: 'Completa: "My ____ is Ana."',
            options: ['name', 'from', 'nice', 'hello'],
            correct: 0,
          },
          {
            id: 'p3',
            question: 'Complete: "I am ____ Mexico."',
            question_es: 'Completa: "I am ____ Mexico."',
            options: ['name', 'from', 'nice', 'hello'],
            correct: 1,
          },
        ],
      },
      writing: {
        title: 'Write About You',
        title_es: 'Escribe sobre ti',
        instruction: 'Write 3 or 4 short sentences.',
        instruction_es: 'Escribe 3 o 4 oraciones cortas.',
        prompt: 'Write: hello, your name, and where you are from.',
        prompt_es: 'Escribe: un saludo, tu nombre y de dónde eres.',
        minWords: 15,
      },
      review: {
        title: "Today's Key Points",
        title_es: 'Puntos clave de hoy',
        keyTakeaways: [
          'You learned 4 words: hello, name, from, nice.',
          'You said your name and where you are from.',
          'You wrote short sentences about yourself.',
        ],
        keyTakeaways_es: [
          'Aprendiste 4 palabras: hello, name, from, nice.',
          'Dijiste tu nombre y de dónde eres.',
          'Escribiste oraciones cortas sobre ti.',
        ],
      },
    },

    // ── 1: Food and shopping ──
    {
      topic: 'Food and Shopping',
      topic_es: 'Comida y compras',
      objective: 'Ask for food and ask how much it costs.',
      objective_es: 'Pedir comida y preguntar cuánto cuesta.',
      warmup: {
        title: 'Your Food',
        title_es: 'Tu comida',
        instruction: 'Think about food you like. Answer in English, even with one or two words.',
        instruction_es: 'Piensa en la comida que te gusta. Responde en inglés, aunque sea con una o dos palabras.',
        prompt: 'What food do you like?',
        prompt_es: '¿Qué comida te gusta?',
      },
      vocabulary: {
        title: 'Shop Words',
        title_es: 'Palabras de la tienda',
        instruction: 'Tap each word to see its meaning. Then say it out loud.',
        instruction_es: 'Toca cada palabra para ver su significado. Luego dila en voz alta.',
        words: [
          {
            word: 'milk',
            pronunciation: '/mɪlk/',
            partOfSpeech: 'noun',
            definition: 'A white drink from cows',
            definition_es: 'Una bebida blanca que viene de las vacas',
            exampleSentence: 'I want milk, please.',
            exampleSentence_es: 'Quiero leche, por favor.',
          },
          {
            word: 'bread',
            pronunciation: '/brɛd/',
            partOfSpeech: 'noun',
            definition: 'Food made from flour',
            definition_es: 'Comida hecha de harina',
            exampleSentence: 'I buy bread every day.',
            exampleSentence_es: 'Compro pan todos los días.',
          },
          {
            word: 'how much',
            pronunciation: '/haʊ mʌtʃ/',
            partOfSpeech: 'phrase',
            definition: 'A question about the price',
            definition_es: 'Una pregunta sobre el precio',
            exampleSentence: 'How much is the milk?',
            exampleSentence_es: '¿Cuánto cuesta la leche?',
          },
          {
            word: 'dollar',
            pronunciation: '/ˈdɑːlɚ/',
            partOfSpeech: 'noun',
            definition: 'Money used in Canada and the USA',
            definition_es: 'Dinero que se usa en Canadá y en EE. UU.',
            exampleSentence: 'The bread is three dollars.',
            exampleSentence_es: 'El pan cuesta tres dólares.',
          },
        ],
      },
      listening: {
        title: 'At the Shop',
        title_es: 'En la tienda',
        instruction: 'Listen to the short talk. Then answer the questions.',
        instruction_es: 'Escucha la conversación corta. Luego responde las preguntas.',
        audioText:
          'Hello. How much is the bread? The bread is three dollars. And the milk? The milk is four dollars. Thank you.',
        questions: [
          {
            id: 'l1',
            question: 'How much is the bread?',
            question_es: '¿Cuánto cuesta el pan?',
            options: ['Two dollars', 'Three dollars', 'Four dollars', 'Five dollars'],
            correct: 1,
          },
          {
            id: 'l2',
            question: 'How much is the milk?',
            question_es: '¿Cuánto cuesta la leche?',
            options: ['Two dollars', 'Three dollars', 'Four dollars', 'Five dollars'],
            correct: 2,
          },
        ],
      },
      speaking: {
        title: 'Say It Out Loud',
        title_es: 'Dilo en voz alta',
        instruction: 'Repeat each phrase slowly and clearly.',
        instruction_es: 'Repite cada frase despacio y con claridad.',
        drills: [
          {
            id: 's1',
            phrase: 'How much is the milk?',
            tip: 'Say "how much" together: howMUCH.',
            tip_es: 'Di "how much" junto: jauMOCH.',
          },
          {
            id: 's2',
            phrase: 'I want bread, please.',
            tip: 'Say "please" clearly: PLEEZ.',
            tip_es: 'Di "please" con claridad: PLIIZ.',
          },
        ],
        conversationPrompt: 'Record yourself in a shop: ask for one food and ask how much it is.',
        conversationPrompt_es: 'Grábate en una tienda: pide una comida y pregunta cuánto cuesta.',
      },
      practice: {
        title: 'Quick Check',
        title_es: 'Repaso rápido',
        instruction: 'Choose the best answer.',
        instruction_es: 'Elige la mejor respuesta.',
        questions: [
          {
            id: 'p1',
            question: 'You want to know the price. What do you say?',
            question_es: 'Quieres saber el precio. ¿Qué dices?',
            options: ['How much is it?', 'What is your name?', 'Where are you from?', 'Good morning.'],
            correct: 0,
          },
          {
            id: 'p2',
            question: 'Which one is a drink?',
            question_es: '¿Cuál es una bebida?',
            options: ['bread', 'milk', 'dollar', 'shop'],
            correct: 1,
          },
          {
            id: 'p3',
            question: 'Complete: "I want bread, ____."',
            question_es: 'Completa: "I want bread, ____."',
            options: ['please', 'name', 'from', 'hello'],
            correct: 0,
          },
        ],
      },
      writing: {
        title: 'Write a List',
        title_es: 'Escribe una lista',
        instruction: 'Write 3 or 4 short sentences.',
        instruction_es: 'Escribe 3 o 4 oraciones cortas.',
        prompt: 'Write about food you want. Example: I want milk. I want bread.',
        prompt_es: 'Escribe sobre la comida que quieres. Ejemplo: I want milk. I want bread.',
        minWords: 15,
      },
      review: {
        title: "Today's Key Points",
        title_es: 'Puntos clave de hoy',
        keyTakeaways: [
          'You learned 4 words: milk, bread, how much, dollar.',
          'You asked how much something costs.',
          'You wrote what food you want.',
        ],
        keyTakeaways_es: [
          'Aprendiste 4 palabras: milk, bread, how much, dollar.',
          'Preguntaste cuánto cuesta algo.',
          'Escribiste qué comida quieres.',
        ],
      },
    },
  ],

  A2: [
    // ── 0: Asking for directions ──
    {
      topic: 'Asking for Directions',
      topic_es: 'Pedir indicaciones',
      objective: 'Ask where a place is and understand simple directions.',
      objective_es: 'Preguntar dónde está un lugar y entender indicaciones sencillas.',
      warmup: {
        title: 'Finding Places',
        title_es: 'Encontrar lugares',
        instruction: 'Think about a place you went to for the first time. Answer in English.',
        instruction_es: 'Piensa en un lugar al que fuiste por primera vez. Responde en inglés.',
        prompt: 'How do you find a new place? Do you ask people or use your phone?',
        prompt_es: '¿Cómo encuentras un lugar nuevo? ¿Preguntas a la gente o usas el teléfono?',
      },
      vocabulary: {
        title: 'Direction Words',
        title_es: 'Palabras para indicaciones',
        instruction: 'Tap each word to see its meaning. Then use it in a sentence.',
        instruction_es: 'Toca cada palabra para ver su significado. Luego úsala en una oración.',
        words: [
          {
            word: 'turn left',
            pronunciation: '/tɜːn lɛft/',
            partOfSpeech: 'phrase',
            definition: 'Go to the left side',
            definition_es: 'Ir hacia el lado izquierdo',
            exampleSentence: 'Turn left at the bank.',
            exampleSentence_es: 'Gira a la izquierda en el banco.',
          },
          {
            word: 'straight',
            pronunciation: '/streɪt/',
            partOfSpeech: 'adverb',
            definition: 'Not turning left or right',
            definition_es: 'Sin girar a la izquierda ni a la derecha',
            exampleSentence: 'Go straight for two blocks.',
            exampleSentence_es: 'Sigue derecho dos cuadras.',
          },
          {
            word: 'next to',
            pronunciation: '/nɛkst tuː/',
            partOfSpeech: 'preposition',
            definition: 'Very close to something, at its side',
            definition_es: 'Muy cerca de algo, a su lado',
            exampleSentence: 'The pharmacy is next to the bank.',
            exampleSentence_es: 'La farmacia está al lado del banco.',
          },
          {
            word: 'corner',
            pronunciation: '/ˈkɔːnɚ/',
            partOfSpeech: 'noun',
            definition: 'The place where two streets meet',
            definition_es: 'El lugar donde se encuentran dos calles',
            exampleSentence: 'The bus stop is on the corner.',
            exampleSentence_es: 'La parada de autobús está en la esquina.',
          },
        ],
      },
      listening: {
        title: 'On the Street',
        title_es: 'En la calle',
        instruction: 'Listen to the directions. Then answer the questions.',
        instruction_es: 'Escucha las indicaciones. Luego responde las preguntas.',
        audioText:
          'Excuse me, where is the pharmacy? Go straight for two blocks. Then turn left at the corner. The pharmacy is next to the bank. You cannot miss it.',
        questions: [
          {
            id: 'l1',
            question: 'How far should you go straight?',
            question_es: '¿Cuánto debes seguir derecho?',
            options: ['One block', 'Two blocks', 'Three blocks', 'Four blocks'],
            correct: 1,
          },
          {
            id: 'l2',
            question: 'Where is the pharmacy?',
            question_es: '¿Dónde está la farmacia?',
            options: ['Next to the bank', 'Next to the school', 'On the bus', 'Behind the shop'],
            correct: 0,
          },
        ],
      },
      speaking: {
        title: 'Say It Out Loud',
        title_es: 'Dilo en voz alta',
        instruction: 'Repeat each phrase clearly. Try to sound natural.',
        instruction_es: 'Repite cada frase con claridad. Intenta sonar natural.',
        drills: [
          {
            id: 's1',
            phrase: 'Excuse me, where is the bank?',
            tip: 'Your voice goes up a little at the end of a question.',
            tip_es: 'La voz sube un poco al final de una pregunta.',
          },
          {
            id: 's2',
            phrase: 'Turn left at the corner.',
            tip: 'Stress "left" and "corner": turn LEFT at the CORner.',
            tip_es: 'Acentúa "left" y "corner": turn LEFT at the CORner.',
          },
        ],
        conversationPrompt: 'Record yourself: ask a person where a place is, then give directions to a place you know.',
        conversationPrompt_es:
          'Grábate: pregunta a una persona dónde está un lugar y luego da indicaciones para llegar a un lugar que conoces.',
      },
      practice: {
        title: 'Quick Check',
        title_es: 'Repaso rápido',
        instruction: 'Choose the best answer.',
        instruction_es: 'Elige la mejor respuesta.',
        questions: [
          {
            id: 'p1',
            question: 'You are lost. What do you say first?',
            question_es: 'Estás perdido. ¿Qué dices primero?',
            options: ['Excuse me, where is the bank?', 'I like your shoes.', 'See you tomorrow.', 'How old are you?'],
            correct: 0,
          },
          {
            id: 'p2',
            question: 'Which phrase means "not left or right"?',
            question_es: '¿Qué frase significa "sin girar a la izquierda ni a la derecha"?',
            options: ['straight', 'corner', 'next to', 'turn left'],
            correct: 0,
          },
          {
            id: 'p3',
            question: 'Complete: "The pharmacy is ____ the bank."',
            question_es: 'Completa: "The pharmacy is ____ the bank."',
            options: ['next to', 'turn', 'straight', 'corner'],
            correct: 0,
          },
        ],
      },
      writing: {
        title: 'Write Directions',
        title_es: 'Escribe indicaciones',
        instruction: 'Write 4 or 5 sentences.',
        instruction_es: 'Escribe 4 o 5 oraciones.',
        prompt: 'A friend wants to come to your home from the bus stop. Write the directions.',
        prompt_es: 'Un amigo quiere llegar a tu casa desde la parada de autobús. Escribe las indicaciones.',
        minWords: 30,
      },
      review: {
        title: "Today's Key Points",
        title_es: 'Puntos clave de hoy',
        keyTakeaways: [
          'You learned direction words: turn left, straight, next to, corner.',
          'You asked where a place is.',
          'You wrote directions to your home.',
        ],
        keyTakeaways_es: [
          'Aprendiste palabras de dirección: turn left, straight, next to, corner.',
          'Preguntaste dónde está un lugar.',
          'Escribiste indicaciones para llegar a tu casa.',
        ],
      },
    },

    // ── 1: Talking about your day ──
    {
      topic: 'Talking About Your Day',
      topic_es: 'Hablar de tu día',
      objective: 'Say what you do every day and at what time.',
      objective_es: 'Decir qué haces cada día y a qué hora.',
      warmup: {
        title: 'Your Morning',
        title_es: 'Tu mañana',
        instruction: 'Think about your morning. Answer in English.',
        instruction_es: 'Piensa en tu mañana. Responde en inglés.',
        prompt: 'What do you do first when you wake up?',
        prompt_es: '¿Qué haces primero cuando te despiertas?',
      },
      vocabulary: {
        title: 'Daily Routine Words',
        title_es: 'Palabras de la rutina diaria',
        instruction: 'Tap each word to see its meaning. Then use it in a sentence.',
        instruction_es: 'Toca cada palabra para ver su significado. Luego úsala en una oración.',
        words: [
          {
            word: 'wake up',
            pronunciation: '/weɪk ʌp/',
            partOfSpeech: 'phrasal verb',
            definition: 'To stop sleeping',
            definition_es: 'Dejar de dormir',
            exampleSentence: "I wake up at six o'clock.",
            exampleSentence_es: 'Me despierto a las seis.',
          },
          {
            word: 'commute',
            pronunciation: '/kəˈmjuːt/',
            partOfSpeech: 'verb',
            definition: 'To travel to work or school',
            definition_es: 'Viajar al trabajo o a la escuela',
            exampleSentence: 'I commute by bus.',
            exampleSentence_es: 'Voy al trabajo en autobús.',
          },
          {
            word: 'usually',
            pronunciation: '/ˈjuːʒuəli/',
            partOfSpeech: 'adverb',
            definition: 'Most of the time',
            definition_es: 'La mayor parte del tiempo',
            exampleSentence: 'I usually eat lunch at noon.',
            exampleSentence_es: 'Normalmente almuerzo al mediodía.',
          },
          {
            word: 'finish',
            pronunciation: '/ˈfɪnɪʃ/',
            partOfSpeech: 'verb',
            definition: 'To end something',
            definition_es: 'Terminar algo',
            exampleSentence: 'I finish work at five.',
            exampleSentence_es: 'Termino de trabajar a las cinco.',
          },
        ],
      },
      listening: {
        title: 'My Day',
        title_es: 'Mi día',
        instruction: 'Listen to the short talk. Then answer the questions.',
        instruction_es: 'Escucha la conversación corta. Luego responde las preguntas.',
        audioText:
          'I usually wake up at six. I commute to work by bus. I start work at eight and I finish at four. In the evening I cook dinner for my family.',
        questions: [
          {
            id: 'l1',
            question: 'How does the speaker go to work?',
            question_es: '¿Cómo va al trabajo la persona que habla?',
            options: ['By bus', 'By car', 'On foot', 'By bike'],
            correct: 0,
          },
          {
            id: 'l2',
            question: 'What time does the work day finish?',
            question_es: '¿A qué hora termina la jornada de trabajo?',
            options: ['At three', 'At four', 'At five', 'At six'],
            correct: 1,
          },
        ],
      },
      speaking: {
        title: 'Say It Out Loud',
        title_es: 'Dilo en voz alta',
        instruction: 'Repeat each phrase clearly. Try to sound natural.',
        instruction_es: 'Repite cada frase con claridad. Intenta sonar natural.',
        drills: [
          {
            id: 's1',
            phrase: 'I usually wake up at six.',
            tip: 'Say "wake up" as one sound: wakeUP.',
            tip_es: 'Di "wake up" como un solo sonido: weikAP.',
          },
          {
            id: 's2',
            phrase: 'I finish work at five.',
            tip: 'Link "finish work": finishwork.',
            tip_es: 'Une "finish work": finishwork.',
          },
        ],
        conversationPrompt:
          'Record yourself: tell us about your day. Say what you do in the morning, at work and in the evening.',
        conversationPrompt_es:
          'Grábate: cuéntanos sobre tu día. Di qué haces en la mañana, en el trabajo y en la noche.',
      },
      practice: {
        title: 'Quick Check',
        title_es: 'Repaso rápido',
        instruction: 'Choose the best answer.',
        instruction_es: 'Elige la mejor respuesta.',
        questions: [
          {
            id: 'p1',
            question: 'Which sentence is about every day?',
            question_es: '¿Qué oración habla de todos los días?',
            options: [
              'I usually wake up at six.',
              'I woke up late yesterday.',
              'I will travel tomorrow.',
              'I am tired now.',
            ],
            correct: 0,
          },
          {
            id: 'p2',
            question: 'What does "commute" mean?',
            question_es: '¿Qué significa "commute"?',
            options: ['Travel to work or school', 'Cook dinner', 'Go to sleep', 'Buy food'],
            correct: 0,
          },
          {
            id: 'p3',
            question: 'Complete: "I ____ work at five."',
            question_es: 'Completa: "I ____ work at five."',
            options: ['finish', 'wake', 'usually', 'commute'],
            correct: 0,
          },
        ],
      },
      writing: {
        title: 'Write About Your Day',
        title_es: 'Escribe sobre tu día',
        instruction: 'Write 4 or 5 sentences.',
        instruction_es: 'Escribe 4 o 5 oraciones.',
        prompt: 'Write about a normal day. Use "usually" and say what time you do things.',
        prompt_es: 'Escribe sobre un día normal. Usa "usually" y di a qué hora haces las cosas.',
        minWords: 30,
      },
      review: {
        title: "Today's Key Points",
        title_es: 'Puntos clave de hoy',
        keyTakeaways: [
          'You learned 4 words: wake up, commute, usually, finish.',
          'You talked about your daily routine.',
          'You wrote about a normal day.',
        ],
        keyTakeaways_es: [
          'Aprendiste 4 palabras: wake up, commute, usually, finish.',
          'Hablaste de tu rutina diaria.',
          'Escribiste sobre un día normal.',
        ],
      },
    },
  ],
};
