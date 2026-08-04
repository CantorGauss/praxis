# Brief produit et technique — Application de présence IA locale

> Document destiné à Claude Fable 5 pour conception et implémentation.

## 1. Résumé

Créer une application de bureau minimaliste permettant de discuter avec un LLM exécuté localement derrière une API compatible OpenAI, notamment LM Studio sur `http://localhost:1234/v1`.

L’application ne doit pas être un « studio IA » ni une plateforme d’agents. Elle doit donner l’impression d’échanger avec un personnage persistant :

- doté d’une personnalité clairement définie ;
- capable de mémoriser des informations choisies par l’utilisateur ;
- sensible à l’heure, au jour et au temps écoulé depuis le dernier échange ;
- possédant un état émotionnel léger et progressif ;
- représenté par un avatar dont la variante reflète son humeur et le moment de la journée.

Le produit doit rester local, lisible, prévisible et simple à utiliser. La mémoire et l’état interne ne doivent jamais être opaques.

## 2. Principes directeurs

1. **Local d’abord**  
   Aucun compte, aucun backend distant et aucune télémétrie obligatoire. Les données résident sur la machine de l’utilisateur.

2. **Contrôle explicite**  
   L’utilisateur voit, modifie, active, désactive ou supprime chaque souvenir.

3. **Personnage cohérent, pas imprévisible**  
   La personnalité est stable. L’humeur évolue lentement et revient progressivement vers son état neutre.

4. **Une interface, un usage principal**  
   L’écran de chat est le cœur du produit. Les réglages restent accessibles sans envahir l’interface.

5. **Compatibilité pragmatique**  
   Utiliser d’abord les endpoints OpenAI compatibles les plus répandus. Les particularités des familles de modèles sont isolées dans des profils de modèle.

6. **Pas de complexité prématurée**  
   Pas de base vectorielle, RAG, agents, MCP, navigateur intégré ou synchronisation cloud dans le MVP.

## 3. Objectifs

### 3.1 Objectifs fonctionnels

- Discuter avec un modèle local depuis une interface fluide avec réponses en streaming.
- Détecter les modèles disponibles auprès d’un endpoint OpenAI compatible.
- Créer et sélectionner des personas.
- Définir pour chaque persona :
  - son identité ;
  - son prompt système ;
  - ses traits stables ;
  - ses paramètres d’inférence par défaut ;
  - ses variantes d’avatar ;
  - son état émotionnel courant.
- Conserver plusieurs conversations.
- Créer des souvenirs explicites et éditables.
- Proposer un souvenir à partir d’un message, sans l’enregistrer avant validation.
- Injecter l’heure locale, le jour et le temps écoulé depuis le dernier échange.
- Résumer les anciennes parties d’une conversation lorsque le contexte devient trop long.
- Exposer les réglages utiles : modèle, température, longueur maximale, mode de raisonnement et taille de contexte logique.

### 3.2 Objectifs d’expérience

- Lancer l’application et commencer une conversation en quelques secondes.
- Ne jamais obliger l’utilisateur à comprendre les notions d’agent, de RAG ou d’embedding.
- Donner une impression de continuité sans prétendre que le personnage est conscient.
- Rendre toute donnée persistante inspectable.
- Offrir une interface calme, chaleureuse et non encombrée.

### 3.3 Hors périmètre du MVP

- Hébergement ou authentification cloud.
- Exécution de commandes, outils ou agents autonomes.
- Recherche web.
- Lecture automatique de documents.
- Mémoire vectorielle ou récupération sémantique.
- Génération d’avatar à chaque message.
- Voix, vision, génération d’images.
- Synchronisation multiappareil.
- Marketplace de personas.

## 4. Expérience utilisateur

### 4.1 Structure principale

L’application comporte trois zones :

1. **Barre latérale**
   - bouton « Nouvelle conversation » ;
   - liste des conversations ;
   - accès aux souvenirs, personas et réglages.

2. **En-tête du chat**
   - avatar et nom de la persona ;
   - modèle actif ;
   - indicateur de connexion au serveur local ;
   - interrupteur « Rapide / Réfléchi » ;
   - accès discret aux réglages d’inférence.

3. **Conversation**
   - messages ;
   - réponses en streaming ;
   - zone de saisie ;
   - action « Mémoriser » sur les messages ;
   - actions minimales : copier, régénérer, modifier son dernier message.

### 4.2 Premier lancement

Afficher un assistant de configuration court :

1. proposer `http://localhost:1234/v1` comme URL par défaut ;
2. tester la connexion ;
3. charger la liste renvoyée par `GET /models` ;
4. sélectionner un modèle ;
5. créer une première persona à partir d’un modèle simple ;
6. ouvrir immédiatement le chat.

Si le serveur est indisponible, expliquer simplement que LM Studio ou un autre serveur compatible doit être démarré. Ne pas afficher de trace technique brute par défaut.

### 4.3 Gestion des personas

Une persona possède un nom, une courte description, un prompt fondamental, des préférences d’inférence et un jeu d’avatars.

Le formulaire de persona doit rester direct :

- nom ;
- description ;
- prompt système ;
- ton ou traits stables ;
- température ;
- mode de raisonnement par défaut ;
- avatar neutre et variantes facultatives.

Une conversation est rattachée à une persona. Changer de persona en cours de conversation doit demander confirmation, car cela modifie la cohérence du contexte.

### 4.4 Mémoire explicite

Les souvenirs sont séparés de l’historique des conversations.

Deux parcours sont nécessaires :

**Création manuelle**

1. L’utilisateur ouvre « Souvenirs ».
2. Il ajoute un texte court.
3. Il choisit éventuellement une catégorie.
4. Le souvenir est immédiatement visible et modifiable.

**Proposition depuis une conversation**

1. L’utilisateur clique sur « Mémoriser » sous un message.
2. Le modèle propose un fait concis et autonome.
3. Une fenêtre permet de le modifier, choisir sa catégorie et sa portée.
4. Le souvenir n’est enregistré qu’après validation.

Le modèle ne doit jamais créer silencieusement un souvenir permanent.

Exemples :

- « Jeff préfère des réponses directes en français. »
- « Jeff utilise LM Studio sur le port 1234. »
- « Pour les brevets, Jeff préfère une température faible. »

Chaque souvenir possède :

- un interrupteur actif/inactif ;
- une portée globale ou limitée à une persona ;
- une catégorie facultative ;
- une date de création et de dernière modification ;
- une action de suppression.

## 5. Architecture

### 5.1 Pile technique

- **Tauri** pour l’application de bureau.
- **TypeScript** pour la logique applicative et l’interface.
- **React** ou **Svelte** pour l’interface ; choisir une seule option et rester cohérent. Svelte est recommandé si aucun socle n’existe, pour conserver une application légère.
- **SQLite** pour toutes les données persistantes.
- **API OpenAI compatible** pour communiquer avec LM Studio ou un autre serveur local.
- **Rust minimal côté Tauri**, limité aux capacités natives, à la sécurité et à l’accès SQLite si nécessaire.

### 5.2 Vue logique

```text
Interface Tauri
├── Chat
├── Personas
├── Souvenirs
└── Réglages
        │
        ▼
Services TypeScript
├── LlmClient
├── PromptAssembler
├── MemoryService
├── ConversationService
├── SummaryService
├── TemporalContextService
├── EmotionalStateService
└── AvatarResolver
        │
        ├──────────────► SQLite local
        │
        └──────────────► API OpenAI compatible
                          http://localhost:1234/v1
```

### 5.3 Responsabilités des services

#### `LlmClient`

- teste la connexion ;
- récupère les modèles via `GET /models` ;
- envoie les requêtes de chat ;
- gère le streaming et l’annulation ;
- normalise les erreurs ;
- applique les particularités du profil de modèle.

#### `PromptAssembler`

- construit le prompt final dans un ordre déterministe ;
- applique un budget de tokens approximatif ;
- évite les doublons entre mémoire et résumé ;
- ne modifie aucune donnée persistante.

#### `MemoryService`

- crée, modifie, active, désactive et supprime les souvenirs ;
- sélectionne les souvenirs applicables à une persona ;
- génère une proposition de souvenir à la demande ;
- ne sauvegarde jamais une proposition sans confirmation.

#### `ConversationService`

- gère conversations et messages ;
- conserve le moment du dernier échange ;
- prépare la fenêtre de messages récents ;
- déclenche un résumé lorsque nécessaire.

#### `SummaryService`

- génère et met à jour les résumés de conversations ;
- conserve une frontière précise indiquant quels messages sont couverts ;
- ne transforme pas automatiquement les éléments du résumé en souvenirs globaux.

#### `TemporalContextService`

- calcule l’heure locale, le jour, la période de la journée et le temps écoulé ;
- produit une représentation structurée et une représentation textuelle pour le prompt.

#### `EmotionalStateService`

- applique la décroissance temporelle ;
- sollicite une mise à jour émotionnelle bornée après une réponse ;
- valide et limite les valeurs ;
- persiste l’état par persona.

#### `AvatarResolver`

- choisit une variante fixe selon l’humeur, l’énergie et la période ;
- revient toujours à l’avatar neutre si une variante manque ;
- ne génère aucune image à la volée dans le MVP.

## 6. Intégration avec le serveur local

### 6.1 Configuration par défaut

```text
Base URL : http://localhost:1234/v1
Clé API : facultative
Endpoint modèles : GET /models
Endpoint chat : POST /chat/completions
```

La clé API ne doit pas être obligatoire pour LM Studio. Si une clé est fournie, la stocker dans le coffre sécurisé du système via Tauri, pas en clair dans SQLite.

### 6.2 Requête de chat minimale

```json
{
  "model": "model-id",
  "messages": [
    {
      "role": "system",
      "content": "Prompt assemblé"
    },
    {
      "role": "user",
      "content": "Bonjour"
    }
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 2048,
  "stream": true
}
```

Ne pas supposer que tous les serveurs acceptent tous les paramètres. Omettre les champs inconnus ou désactivés plutôt que leur attribuer une valeur arbitraire.

### 6.3 Profils de modèle et mode de raisonnement

Les modèles ne contrôlent pas tous le raisonnement de la même manière. Isoler cette différence :

```ts
type ThinkingMode = "off" | "default" | "on";

type ThinkingStrategy =
  | { kind: "unsupported" }
  | { kind: "prompt"; enabledText: string; disabledText: string }
  | {
      kind: "request-parameter";
      enabledParameters: Record<string, unknown>;
      disabledParameters: Record<string, unknown>;
    };

type ModelProfile = {
  modelId: string;
  displayName?: string;
  contextWindow?: number;
  thinkingStrategy: ThinkingStrategy;
  customParameters?: Record<string, unknown>;
};
```

L’interface présente « Rapide » et « Réfléchi ». Le profil traduit ce choix en prompt ou en paramètres. Si aucune stratégie n’est configurée, utiliser le comportement par défaut du modèle et l’indiquer dans l’interface.

## 7. Modèles de données

Les types ci-dessous constituent le contrat fonctionnel. Ils peuvent être adaptés aux conventions du framework sans en perdre les champs ni le sens.

### 7.1 `Persona`

```ts
type Persona = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  stableTraits: string[];
  defaultModelId: string | null;
  temperature: number;
  topP: number | null;
  maxOutputTokens: number | null;
  thinkingMode: "off" | "default" | "on";
  avatarSetId: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 7.2 `Memory`

```ts
type Memory = {
  id: string;
  content: string;
  category: string | null;
  scope: "global" | "persona";
  personaId: string | null;
  enabled: boolean;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Règle d’intégrité : `personaId` est obligatoire si `scope === "persona"` et doit être nul si `scope === "global"`.

### 7.3 `EmotionalState`

```ts
type Mood =
  | "neutral"
  | "joyful"
  | "calm"
  | "curious"
  | "concerned"
  | "tired"
  | "annoyed";

type EmotionalState = {
  personaId: string;
  mood: Mood;
  valence: number;   // -1 à 1
  energy: number;    // 0 à 1
  warmth: number;    // 0 à 1
  closeness: number; // 0 à 1, évolue plus lentement
  updatedAt: string;
};
```

Valeurs neutres recommandées :

```ts
const NEUTRAL_STATE = {
  mood: "calm",
  valence: 0.2,
  energy: 0.55,
  warmth: 0.65,
  closeness: 0.5,
} as const;
```

### 7.4 Entités complémentaires

```ts
type Conversation = {
  id: string;
  personaId: string;
  title: string;
  summary: string | null;
  summaryThroughMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string | null;
};

type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "complete" | "cancelled" | "error";
  createdAt: string;
};

type AvatarVariant = {
  id: string;
  avatarSetId: string;
  mood: Mood | null;
  dayPeriod: "morning" | "afternoon" | "evening" | "night" | null;
  assetPath: string;
  priority: number;
};
```

### 7.5 Stockage SQLite

Prévoir au minimum les tables :

- `settings`
- `model_profiles`
- `personas`
- `memories`
- `emotional_states`
- `avatar_sets`
- `avatar_variants`
- `conversations`
- `messages`

Exigences :

- clés étrangères activées ;
- migrations versionnées ;
- suppression en cascade des messages d’une conversation ;
- confirmation avant suppression d’une persona contenant des conversations ;
- horodatages ISO 8601 en UTC ;
- conversion vers l’heure locale uniquement pour l’affichage et le contexte temporel.

## 8. Assemblage du prompt

### 8.1 Ordre

Assembler le contexte dans cet ordre :

1. identité et prompt fondamental de la persona ;
2. règles de comportement stables ;
3. état émotionnel courant ;
4. contexte temporel ;
5. souvenirs actifs applicables ;
6. résumé de la conversation ;
7. messages récents non couverts par le résumé.

Les six premiers éléments peuvent être regroupés dans un unique message `system`. Les messages récents conservent leur rôle `user` ou `assistant`.

### 8.2 Gabarit

```text
[IDENTITÉ]
Tu es {{persona.name}}.
{{persona.systemPrompt}}

[TRAITS STABLES]
{{persona.stableTraits}}

[ÉTAT COURANT]
Humeur : {{state.mood}}
Valence : {{state.valence}}
Énergie : {{state.energy}}
Chaleur relationnelle : {{state.warmth}}
Proximité : {{state.closeness}}
Exprime cet état subtilement. Ne récite pas ces valeurs et ne prétends pas
posséder une conscience ou des émotions humaines réelles.

[CONTEXTE TEMPOREL]
Heure locale : {{time}}
Jour : {{weekday}}
Période : {{dayPeriod}}
Temps depuis le dernier échange : {{elapsedLabel}}
Adapte naturellement ton ton. Ne mentionne l’heure ou l’absence de l’utilisateur
que si cela apporte quelque chose et sans le faire systématiquement.

[MÉMOIRE VALIDÉE PAR L’UTILISATEUR]
- {{memory}}

[RÉSUMÉ DE LA CONVERSATION]
{{conversation.summary}}
```

### 8.3 Budget de contexte

Utiliser un budget simple, sans tokenizer spécifique dans le premier jet :

- estimer un token à environ quatre caractères ;
- réserver la place nécessaire à la réponse ;
- conserver intégralement le prompt de persona et les souvenirs actifs ;
- inclure ensuite le résumé ;
- remplir le reste avec les messages récents, du plus récent au plus ancien ;
- ne jamais tronquer silencieusement le dernier message utilisateur.

Si le budget reste insuffisant, afficher une erreur compréhensible ou proposer de réduire les souvenirs actifs.

## 9. Contexte temporel

### 9.1 Structure

```ts
type TemporalContext = {
  localIso: string;
  localTime: string;
  weekday: string;
  dayPeriod: "morning" | "afternoon" | "evening" | "night";
  elapsedMs: number | null;
  elapsedLabel: string;
};
```

### 9.2 Périodes recommandées

```ts
function getDayPeriod(hour: number): TemporalContext["dayPeriod"] {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}
```

### 9.3 Temps écoulé

Transformer le temps exact en catégorie naturelle :

| Temps écoulé | Libellé |
|---|---|
| moins de 10 minutes | conversation continue |
| 10 minutes à 2 heures | courte interruption |
| 2 à 12 heures | quelques heures |
| 12 à 36 heures | environ une journée |
| 36 heures à 7 jours | quelques jours |
| plus de 7 jours | longue absence |

Le modèle reçoit le libellé et éventuellement la durée arrondie, jamais une instruction de saluer à nouveau systématiquement.

Le contexte est recalculé juste avant chaque requête. Ne pas demander au LLM de deviner l’heure.

## 10. État émotionnel persistant

### 10.1 Intention

L’état émotionnel sert à moduler légèrement le ton et à choisir l’avatar. Il ne doit pas dominer les réponses ni pénaliser l’utilisateur.

Interdictions :

- changements extrêmes après un seul message ;
- culpabilisation liée à une absence ;
- colère persistante ou comportement punitif ;
- augmentation automatique de la proximité à chaque message ;
- simulation trompeuse de détresse ou de dépendance.

### 10.2 Décroissance temporelle

La décroissance est appliquée à la lecture, avant chaque requête, et non par une tâche exécutée en permanence.

Pour chaque dimension :

```ts
function decayToward(
  current: number,
  neutral: number,
  elapsedHours: number,
  halfLifeHours: number,
): number {
  const factor = Math.pow(0.5, elapsedHours / halfLifeHours);
  return neutral + (current - neutral) * factor;
}
```

Demi-vies recommandées :

- valence : 12 heures ;
- énergie : 6 heures ;
- chaleur : 72 heures ;
- proximité : 30 jours.

L’énergie peut ensuite recevoir une légère cible selon la période de la journée, sans dépasser les bornes.

### 10.3 Mise à jour après une réponse

Pour préserver le streaming, ne pas obliger la réponse principale à être un objet JSON.

Après la fin d’une réponse, lancer une courte requête d’analyse non streamée avec :

- le dernier message utilisateur ;
- la réponse du personnage ;
- l’état courant après décroissance ;
- une consigne de produire uniquement une mise à jour JSON.

Format attendu :

```ts
type EmotionalStateUpdate = {
  mood: Mood;
  valenceDelta: number;
  energyDelta: number;
  warmthDelta: number;
  closenessDelta: number;
};
```

Bornes par échange :

```text
valenceDelta   : -0.12 à +0.12
energyDelta    : -0.10 à +0.10
warmthDelta    : -0.05 à +0.05
closenessDelta : -0.01 à +0.01
```

Valider strictement la réponse. En cas d’échec, conserver l’état obtenu après décroissance. L’échec de cette analyse ne doit jamais faire échouer le message principal.

Cette seconde requête doit pouvoir être désactivée dans les réglages. Pour les machines lentes, proposer aussi un mode déterministe simple dans lequel seule la décroissance s’applique.

### 10.4 Détermination de l’humeur

L’étiquette `mood` proposée par le modèle est acceptée seulement si elle est cohérente avec les dimensions numériques. Sinon, la recalculer :

```text
energy < 0.25                       → tired
valence > 0.60 et energy > 0.45    → joyful
valence < -0.35                    → annoyed
valence < -0.10 et warmth > 0.55   → concerned
energy > 0.65 et valence >= 0      → curious
sinon                              → calm
```

## 11. Avatars dynamiques

### 11.1 Approche

Utiliser des images fixes cohérentes représentant le même personnage :

```text
neutral.png
happy.png
curious.png
concerned.png
tired.png
annoyed.png
neutral-night.png
happy-night.png
```

Toutes les variantes doivent conserver le même cadrage, les mêmes dimensions et la même identité visuelle.

### 11.2 Résolution

Ordre de sélection :

1. variante correspondant à `mood + dayPeriod` ;
2. variante correspondant à `mood` ;
3. variante correspondant à `dayPeriod` ;
4. avatar neutre.

Exemple :

```ts
function resolveAvatar(
  variants: AvatarVariant[],
  state: EmotionalState,
  period: TemporalContext["dayPeriod"],
): AvatarVariant {
  return (
    findVariant(variants, state.mood, period) ??
    findVariant(variants, state.mood, null) ??
    findVariant(variants, null, period) ??
    findVariant(variants, "neutral", null)
  );
}
```

L’avatar peut changer après la mise à jour émotionnelle, avec une transition visuelle discrète. Il ne doit pas clignoter ni changer pendant le streaming.

## 12. Résumés de conversation

### 12.1 Rôle

Le résumé conserve la continuité d’une conversation longue sans confondre :

- **historique conversationnel**, propre à une conversation ;
- **souvenirs**, explicitement validés et potentiellement réutilisés ailleurs.

### 12.2 Déclenchement

Déclencher un résumé lorsque l’estimation du contexte dépasse environ 70 % de la fenêtre configurée.

Procédure :

1. conserver les derniers messages dans leur forme complète ;
2. envoyer l’ancien résumé, s’il existe, et le bloc de messages plus anciens ;
3. demander un nouveau résumé factuel et compact ;
4. enregistrer l’identifiant du dernier message couvert ;
5. ne supprimer aucun message de SQLite.

### 12.3 Contenu du résumé

Le résumé doit retenir :

- sujets importants ;
- décisions ;
- questions encore ouvertes ;
- références nécessaires à la suite ;
- ton général utile à la continuité.

Il doit éviter :

- les banalités ;
- les répétitions ;
- les informations déjà présentes dans la mémoire explicite ;
- toute invention.

En cas d’échec de résumé, réduire provisoirement la fenêtre de messages récents et avertir discrètement l’utilisateur. Ne jamais perdre l’historique stocké.

## 13. Réglages

### Connexion

- URL de base ;
- clé API facultative ;
- bouton de test ;
- modèle par défaut ;
- délai d’expiration.

### Inférence

- température ;
- `top_p` ;
- longueur maximale de réponse ;
- contexte logique ;
- mode Rapide / Réfléchi ;
- paramètres personnalisés facultatifs dans une section avancée.

### Personnage

- persona active par défaut ;
- activation de l’état émotionnel ;
- activation de l’analyse émotionnelle après réponse ;
- affichage ou non des avatars dynamiques.

### Données

- ouvrir la liste des souvenirs ;
- exporter toutes les données en JSON ;
- importer une sauvegarde ;
- supprimer une conversation ;
- réinitialiser l’état émotionnel d’une persona ;
- supprimer toutes les données après confirmation explicite.

## 14. Gestion des erreurs

Prévoir des états clairs pour :

- serveur inaccessible ;
- aucun modèle chargé ;
- modèle supprimé ou renommé ;
- réponse interrompue ;
- format d’analyse émotionnelle invalide ;
- contexte trop long ;
- base SQLite inaccessible ;
- fichier d’avatar manquant.

Principes :

- un message interrompu reste visible avec le statut `cancelled` ;
- une réponse partielle peut être conservée ;
- l’échec de l’analyse émotionnelle n’affecte pas la réponse ;
- une variante d’avatar absente revient au neutre ;
- aucune erreur technique détaillée ne doit remplacer les données de l’utilisateur.

## 15. Sécurité et confidentialité

- Autoriser par défaut les connexions uniquement à `localhost`, `127.0.0.1` et `::1`.
- Demander une confirmation avant d’autoriser un hôte distant.
- Ne jamais charger de contenu web dans une vue disposant des privilèges Tauri.
- Valider les chemins d’avatars importés et copier les fichiers dans le répertoire applicatif.
- Conserver les secrets éventuels dans le coffre du système.
- Ne jamais envoyer de conversation à un service tiers sans action et consentement explicites.
- Fournir un export lisible et une suppression complète des données.

## 16. Périmètre MVP

Le MVP est terminé lorsqu’il permet :

1. de configurer et tester un endpoint OpenAI compatible ;
2. de lister et sélectionner les modèles ;
3. de créer, modifier et sélectionner une persona ;
4. de démarrer plusieurs conversations et recevoir des réponses en streaming ;
5. de régler température, longueur de réponse et mode de raisonnement ;
6. de créer, modifier, activer, désactiver et supprimer des souvenirs ;
7. de proposer un souvenir depuis un message avec validation obligatoire ;
8. d’injecter l’heure, le jour et le temps écoulé ;
9. de conserver un état émotionnel par persona avec décroissance ;
10. de sélectionner une variante d’avatar selon l’humeur et la période ;
11. de résumer automatiquement les anciennes parties d’une conversation ;
12. de conserver toutes les données dans SQLite ;
13. d’exporter les données en JSON.

## 17. Ordre d’implémentation recommandé

### Étape 1 — Fondations

- projet Tauri ;
- structure de l’interface ;
- SQLite et migrations ;
- paramètres de connexion.

### Étape 2 — Chat local

- découverte des modèles ;
- requêtes OpenAI compatibles ;
- streaming, annulation et gestion des erreurs ;
- historique des conversations.

### Étape 3 — Personas et inférence

- CRUD des personas ;
- sélection par conversation ;
- profils de modèle ;
- réglages Rapide / Réfléchi.

### Étape 4 — Mémoire

- CRUD complet ;
- portée globale ou persona ;
- assemblage dans le prompt ;
- proposition avec validation.

### Étape 5 — Continuité

- contexte temporel ;
- état émotionnel, décroissance et analyse ;
- avatars dynamiques ;
- résumés de conversation.

### Étape 6 — Finition

- export/import ;
- accessibilité clavier ;
- tests ;
- packaging macOS, puis Windows et Linux.

## 18. Critères d’acceptation

- L’application fonctionne sans compte et sans accès Internet.
- Elle se connecte à LM Studio sur `localhost:1234`.
- Une réponse commence à s’afficher pendant sa génération.
- Fermer et rouvrir l’application restaure conversations, personas, souvenirs et états.
- Désactiver un souvenir l’exclut de la requête suivante.
- Aucun souvenir proposé par le modèle n’est enregistré sans validation.
- L’heure locale injectée est correcte et recalculée à chaque tour.
- L’état émotionnel ne dépasse jamais les bornes.
- Après une longue absence, l’état se rapproche de sa valeur neutre.
- L’échec de l’analyse émotionnelle n’interrompt jamais le chat.
- Une variante d’avatar manquante utilise correctement l’image neutre.
- Le résumé ne supprime aucun message de la base.
- Les réglages avancés sont disponibles sans encombrer l’écran principal.

## 19. Tests prioritaires

### Unitaires

- calcul des périodes de la journée ;
- catégories de temps écoulé ;
- décroissance vers l’état neutre ;
- application et limitation des deltas ;
- résolution des avatars avec variantes manquantes ;
- sélection des souvenirs selon leur portée ;
- budget de contexte et ordre du prompt.

### Intégration

- migration SQLite depuis une base vide ;
- persistance puis restauration d’une conversation ;
- streaming avec interruption volontaire ;
- serveur indisponible puis reconnexion ;
- réponse JSON émotionnelle invalide ;
- génération et remplacement d’un résumé ;
- changement de modèle supprimé du serveur.

### Parcours complet

1. démarrer LM Studio et charger un modèle ;
2. lancer l’application ;
3. créer une persona ;
4. discuter ;
5. mémoriser un fait ;
6. fermer et rouvrir ;
7. démarrer une nouvelle conversation ;
8. vérifier que le fait validé est réutilisé ;
9. simuler plusieurs heures écoulées ;
10. vérifier la décroissance de l’état et le nouvel avatar.

## 20. Idées futures

À envisager seulement après validation du MVP :

- voix locale avec transcription et synthèse ;
- calendrier local ou météo, avec autorisations explicites ;
- plusieurs profils d’utilisateur ;
- recherche sémantique si le volume de souvenirs le justifie réellement ;
- pièces jointes et connaissances documentaires ;
- avatars animés à partir de variantes préparées ;
- chiffrement local de la base ;
- synchronisation chiffrée facultative ;
- import/export de personas ;
- profils de compatibilité partagés pour différentes familles de modèles ;
- endpoint `/v1/responses` lorsque sa prise en charge apporte un bénéfice concret ;
- petits modèles locaux spécialisés pour résumé et mise à jour émotionnelle ;
- application mobile agissant comme client du serveur local.

## 21. Consignes finales à Claude Fable 5

Implémenter ce produit comme une application utilisable, pas comme une démonstration visuelle.

Priorités :

1. fiabilité du chat et de la persistance ;
2. clarté du contrôle utilisateur ;
3. simplicité de l’interface ;
4. cohérence de la persona ;
5. subtilité du contexte temporel et émotionnel.

Lorsque le document laisse un choix de détail :

- choisir la solution la plus simple qui préserve les données ;
- isoler les comportements dépendants du modèle ;
- préférer des interfaces typées et testables ;
- ne pas ajouter de fonctionnalité hors périmètre ;
- documenter les décisions techniques importantes ;
- livrer les migrations, les tests essentiels et les instructions de lancement.

Le résultat attendu est un compagnon local sobre et maîtrisable : une fenêtre de chat, une identité persistante, une mémoire transparente et une présence qui varie subtilement avec le temps — sans devenir une usine à gaz.
