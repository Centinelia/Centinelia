# Topología Centinelia

## 1. Sistema Completo

```mermaid
flowchart TD
    subgraph ENTRADA["Entrada"]
        TEL[Teléfono / Twilio]
        WEB[Portal Web]
    end

    subgraph VAPI_BOX["VAPI — Orquestador de Voz"]
        DG[Deepgram STT]
        EL[ElevenLabs TTS]
        CL[Claude Haiku]
    end

    subgraph API["Centinelia — Next.js API"]
        IN["/voice/inbound"]
        WH["/voice/webhook"]
        TL["25 Herramientas"]
        PA["Portal API — 80+ rutas"]
        AA["Admin API"]
    end

    subgraph AI_POST["IA Post-llamada"]
        CES["CES — Score conversacional"]
        SE["Self-eval"]
        EL2["Extract Learnings"]
        INI["Iniciativa — Patrones"]
        TF["Team Feed"]
    end

    subgraph DB["Supabase — Base de Datos"]
        VA[(voice_agents)]
        VC[(voice_calls)]
        LV[(leads_voice)]
        CU[(customers)]
        CL2[(conversational_learnings)]
        AT[(agent_tasks)]
        AM[(account_minutes)]
    end

    subgraph EXT["Integraciones Externas"]
        STR["Stripe"]
        NOT["Notion CRM"]
        GAP["Gmail + Drive"]
        MSO["Outlook + OneDrive"]
        WA["WhatsApp"]
        CAL["Cal.com"]
        BRV["Brave Search"]
        GRV["Google Reviews"]
    end

    TEL --> VAPI_BOX
    VAPI_BOX --> IN
    IN --> VA
    IN --> VAPI_BOX
    VAPI_BOX --> TL
    TL --> DB
    TL --> EXT
    VAPI_BOX --> WH
    WH --> VC
    WH --> LV
    WH --> CU
    WH --> AM
    WH --> AI_POST
    AI_POST --> CL2
    WH --> WA
    WH --> NOT
    WEB --> PA
    PA --> DB
    PA --> EXT
    AA --> DB
```

---

## 2. Flujo de Llamada

```mermaid
sequenceDiagram
    participant C as Llamante
    participant V as VAPI
    participant I as /inbound
    participant T as Herramientas
    participant W as /webhook
    participant DB as Supabase
    participant AI as Claude

    C->>V: Llama al número
    V->>I: POST /voice/inbound
    I->>DB: Busca voice_agent por teléfono
    I->>DB: Verifica cuenta activa y minutos
    I->>DB: Historial y perfil del llamante
    I->>AI: buildSystemPrompt + HCP + CCE
    I-->>V: Config del asistente

    loop Durante la llamada
        C->>V: Habla
        V->>V: Deepgram transcribe
        V->>AI: Claude decide respuesta
        AI-->>T: Ejecuta herramienta si aplica
        T->>DB: Lee y escribe datos
        T-->>AI: Resultado
        V->>C: ElevenLabs habla
    end

    C->>V: Termina llamada
    V->>W: end-of-call-report
    W->>DB: Guarda voice_call, lead, cita
    W->>DB: Incrementa minutos usados
    W->>AI: CES 6 dimensiones
    W->>AI: Self-eval
    W->>AI: Extract Learnings
    AI->>DB: conversational_learnings
    W->>C: WhatsApp follow-up
    W->>NOT: Registro CRM Notion
```

---

## 3. Empleados y Conexiones

> El equipo de cada cliente es distinto. La red entre compañeros se forma dinámicamente con los empleados activos de esa cuenta. Cualquier empleado puede consultar, delegar o transferir a cualquier compañero disponible.

```mermaid
flowchart TD
    subgraph EQUIPO["Equipo del cliente — composición variable"]
        NIA["Nia — Recepción"]
        NOAH["Noah — Ventas"]
        NARA["Nara — Coordinación"]
        NEO["Neo — Tecnología"]
        NAIA["Naia — RRHH"]
        NICO["Nico — Recuperación"]
        NELIA["Nelia — Atención al Cliente"]
        NOVA["Nova — Despacho"]
        NOX["Nox — Director"]
        NIVA["Niva — Directora"]
        CUSTOM["Personalizado"]
    end

    RED["Red de compañeros\nconsultar / delegar / transferir"]

    NIA <-->|peer| RED
    NOAH <-->|peer| RED
    NARA <-->|peer| RED
    NEO <-->|peer| RED
    NAIA <-->|peer| RED
    NICO <-->|peer| RED
    NELIA <-->|peer| RED
    NOVA <-->|peer| RED
    NOX <-->|peer| RED
    NIVA <-->|peer| RED
    CUSTOM <-->|peer| RED
```

**Reglas de la red:**
- Un cliente con solo 1 empleado no tiene peers — opera solo.
- Un cliente con 5 empleados sin directores puede delegar y consultar entre esos 5.
- Un cliente con 5 empleados personalizados tiene la misma red entre ellos.
- Los directores (Nox/Niva) no tienen privilegios especiales en el código — son peers como cualquier otro.

---

## 4. Pipeline de Aprendizaje

```mermaid
flowchart LR
    CALL["Llamada terminada"] --> WH["/webhook"]
    WH --> CES["CES Eval\n6 dimensiones"]
    WH --> SE["Self-eval"]
    WH --> EL["Extract Learnings"]

    CES -->|score bajo| RULE["Regla condicional"]
    RULE --> CL[(conversational_learnings)]
    CL --> TARGET{target_document}
    TARGET -->|CCE| CCE_DOC["Motor Conversacional"]
    TARGET -->|HCP| HCP_DOC["Patrones Humanos"]
    TARGET -->|MDP| MDP_DOC["Micro-decisiones"]

    EL --> AL[(agent_learnings)]
    AL --> PORTAL["Portal Aprendizaje"]

    CL --> CRON["Cron semanal"]
    CRON -->|aprobado| ACTIVE["Activa en todos los agentes"]
    CRON -->|pendiente| REVIEW["Revisión manual"]
```
