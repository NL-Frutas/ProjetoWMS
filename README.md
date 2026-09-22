# Integração SonarQube Cloud + GitHub Actions

Guia de referência para configurar análise de qualidade de código com o **SonarQube Cloud** integrado ao **GitHub Actions**, usando bloqueio automático de Pull Requests via Quality Gate.

Este repositório (`ProjetoWMS`) é um ambiente de testes, usado para validar e documentar esse fluxo de integração antes de aplicá-lo a um repositório definitivo.

## Sumário

- [Objetivo](#objetivo)
- [Pré-requisitos](#pré-requisitos)
- [Passo a passo da configuração](#passo-a-passo-da-configuração)
  - [1. Criar o projeto no SonarQube Cloud](#1-criar-o-projeto-no-sonarqube-cloud)
  - [2. Gerar o token e configurar o secret](#2-gerar-o-token-e-configurar-o-secret)
  - [3. Configurar o sonar-project.properties](#3-configurar-o-sonar-projectproperties)
  - [4. Configurar o workflow do GitHub Actions](#4-configurar-o-workflow-do-github-actions)
  - [5. Proteger a branch main](#5-proteger-a-branch-main)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Testes e cobertura](#testes-e-cobertura)
- [Quality Gate](#quality-gate)
- [Adaptando para outras linguagens](#adaptando-para-outras-linguagens)
- [Boas práticas de segurança aplicadas](#boas-práticas-de-segurança-aplicadas)
- [Boas práticas gerais do fluxo](#boas-práticas-gerais-do-fluxo)
- [Erros comuns e soluções](#erros-comuns-e-soluções)
- [Fluxo de contribuição](#fluxo-de-contribuição)
- [Autor](#autor)

## Objetivo

Bloquear o merge de um Pull Request na `main` sempre que o código novo:

- Introduzir bugs, vulnerabilidades ou code smells;
- Tiver cobertura de testes abaixo do limite definido;
- Ultrapassar o limite de duplicação de código;
- Tiver problemas de segurança não revisados (Security Hotspots).

Tudo isso é verificado automaticamente pelo GitHub Actions a cada `push` e a cada Pull Request, sem depender de revisão manual para pegar esse tipo de problema.

## Pré-requisitos

- Uma organização no [SonarQube Cloud](https://sonarcloud.io) vinculada à organização do GitHub.
- Permissão de administrador no repositório do GitHub, para configurar secrets e regras de proteção de branch.
- [Node.js 20+](https://nodejs.org/) instalado localmente (o exemplo deste repositório usa JavaScript; o mesmo fluxo se aplica a outras linguagens, trocando as etapas de build e teste).

## Passo a passo da configuração

### 1. Criar o projeto no SonarQube Cloud

1. Em [sonarcloud.io](https://sonarcloud.io), clique em **+ → Analyze new project**.
2. Se a organização do GitHub não aparecer, instale o app **SonarQube Cloud** nela, em **Import another organization**, concedendo acesso ao repositório desejado.
3. Selecione o repositório e escolha o método de análise **With GitHub Actions**. Isso cria o projeto e mostra a **Project Key** e a **Organization Key**.
4. Em **Administration → Analysis Method**, desative a opção **Automatic Analysis**. Com ela ativa, a análise feita pelo CI é rejeitada por conflito.

### 2. Gerar o token e configurar o secret

1. No SonarQube Cloud, vá em **My Account → Security → Generate Tokens** e gere um token de usuário.
2. No repositório do GitHub, acesse **Settings → Secrets and variables → Actions**, aba **Secrets**.
3. Em **Repository secrets**, clique em **New repository secret**, use o nome exato `SONAR_TOKEN` e cole o token.

> **Atenção ao local certo.** Existem três abas parecidas: *Actions*, *Codespaces* e *Dependabot*. Só **Repository secrets** dentro de *Actions* é lido pelo workflow. Um secret criado como **Environment secret** também não é lido, a menos que o job declare `environment:` explicitamente.

### 3. Configurar o `sonar-project.properties`

Arquivo na raiz do repositório, com a chave do projeto e da organização geradas no passo 1:

```properties
sonar.projectKey=NL-Frutas_ProjetoWMS
sonar.organization=nl-frutas

sonar.sources=.
sonar.exclusions=**/node_modules/**,**/coverage/**
sonar.tests=.
sonar.test.inclusions=**/*.test.js
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

### 4. Configurar o workflow do GitHub Actions

Arquivo `.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  validar:
    name: Validar codigo
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Instalar dependências
        run: npm ci --ignore-scripts

      - name: Checar sintaxe de todos os .js
        run: |
          find . -name "*.js" -not -path "./node_modules/*" -print0 \
            | xargs -0 -n1 node --check

      - name: Rodar testes
        run: node --test

  sonarcloud:
    name: SonarCloud Analysis
    needs: validar
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Instalar dependências
        run: npm ci --ignore-scripts

      - name: Rodar testes com cobertura
        run: npm run coverage

      - name: SonarCloud Scan
        uses: SonarSource/sonarqube-scan-action@2f77a1ec69fb1d595b06f35ab27e97605bdef703 # v5.3.2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          args: >
            -Dsonar.qualitygate.wait=true
            -Dsonar.qualitygate.timeout=300
```

**O que cada job faz:**

- **`validar`**: instala as dependências, verifica a sintaxe de todos os arquivos `.js` (`node --check`) e roda a suíte de testes. Serve como barreira rápida antes de gastar tempo com a análise do Sonar.
- **`sonarcloud`**: depende do `validar` (`needs: validar`), gera o relatório de cobertura com os testes e envia tudo ao SonarQube Cloud. Com `sonar.qualitygate.wait=true`, o job só termina depois que o Quality Gate for avaliado, e falha se o gate for reprovado.

### 5. Proteger a branch `main`

Em **Settings → Rules → Rulesets**, criar uma regra (ex.: `MainProtect`) com:

- **Bypass list**: vazia, para valer também para administradores.
- **Target branches**: `main` (ou a branch padrão).
- **Require a pull request before merging**: ativado.
- **Require status checks to pass**, adicionando:
  - `Build / Validar codigo`
  - `Build / SonarCloud Analysis`
  - `SonarCloud Code Analysis`
- **Block force pushes**: ativado.
- **Require branches to be up to date before merging**: recomendado, para o gate sempre avaliar contra a versão mais recente da `main`.

> Os checks só aparecem na busca depois de rodarem pelo menos uma vez em algum Pull Request. Se não encontrar um check na lista, abra um PR de teste primeiro.

## Estrutura de arquivos

```
ProjetoWMS/
├── .github/
│   └── workflows/
│       └── build.yml          # Pipeline de CI (validação + SonarQube)
├── index.js                   # Código de exemplo, usado para testar a integração
├── index.test.js              # Testes automatizados (node:test)
├── package.json                # Scripts test e coverage
├── package-lock.json
├── sonar-project.properties    # Configuração do projeto no SonarQube Cloud
├── .gitignore
└── README.md
```

## Testes e cobertura

Os testes usam o executor nativo do Node.js (`node:test`), sem dependências externas. A cobertura é gerada com [`c8`](https://github.com/bcoe/c8):

```bash
npm test        # roda os testes
npm run coverage # roda os testes e gera coverage/lcov.info
```

O `lcov.info` é o arquivo lido pelo Sonar através de `sonar.javascript.lcov.reportPaths`. Sem testes cobrindo o código novo, a condição de cobertura do Quality Gate falha e bloqueia o merge, mesmo que o resto do código esteja correto.

## Quality Gate

O gate padrão do SonarQube Cloud é o **Sonar way**, que avalia principalmente o código novo (*New Code*) de cada Pull Request, e não o projeto inteiro. Isso evita travar um projeto legado por dívidas técnicas antigas, cobrando qualidade apenas do que está sendo adicionado.

| Condição | Critério exigido |
|---|---|
| Issues novos | 0 |
| Security Hotspots revisados | 100% |
| Cobertura no código novo | ≥ 80% |
| Duplicação no código novo | ≤ 3% |
| Security Rating no código novo | A |
| Reliability Rating no código novo | A |
| Maintainability Rating no código novo | A |

**Se o repositório ainda não tiver testes**, e por isso a cobertura ficar sempre em 0%, existem duas formas de destravar o fluxo enquanto os testes não são escritos:

- **Copiar o Quality Gate** (**Organization → Quality Gates → Copy** no Sonar way) e remover a condição de cobertura na cópia.
- **Excluir a cobertura no `sonar-project.properties`**: `sonar.coverage.exclusions=**/*`.

Ambas são soluções temporárias. O ideal é reverter assim que os testes existirem.

## Adaptando para outras linguagens

Este repositório usa JavaScript como exemplo, mas a estrutura do pipeline (job de validação → job de análise com cobertura → Sonar) se repete em qualquer linguagem. O que muda são três pontos: o **comando de build/teste**, o **gerador de relatório de cobertura** e a **propriedade do Sonar** que aponta para esse relatório.

### Java (Maven)

```yaml
- uses: actions/setup-java@v4
  with:
    distribution: temurin
    java-version: '17'

- name: Build e testes com cobertura
  run: mvn -B verify -Dmaven.test.failure.ignore=false
```

```properties
sonar.java.binaries=target/classes
sonar.coverage.jacoco.xmlReportPaths=target/site/jacoco/jacoco.xml
```

O plugin `jacoco-maven-plugin` precisa estar configurado no `pom.xml` para gerar o relatório XML durante o `mvn verify`.

### Java (Gradle)

```yaml
- uses: actions/setup-java@v4
  with:
    distribution: temurin
    java-version: '17'

- name: Build e testes com cobertura
  run: ./gradlew build jacocoTestReport
```

```properties
sonar.coverage.jacoco.xmlReportPaths=build/reports/jacoco/test/jacocoTestReport.xml
```

### .NET

```yaml
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '8.x'

- name: Restaurar e testar com cobertura
  run: |
    dotnet restore
    dotnet test --collect:"XPlat Code Coverage" --results-directory ./coverage
```

```properties
sonar.cs.vscoveragexml.reportsPaths=coverage/**/coverage.cobertura.xml
```

Para .NET, o scanner costuma rodar em três etapas (`begin`, build, `end`), usando o `SonarScanner for .NET` em vez do scanner genérico:

```yaml
- name: SonarScanner begin
  run: dotnet sonarscanner begin /k:"NL-Frutas_ProjetoWMS" /o:"nl-frutas" /d:sonar.token="${{ secrets.SONAR_TOKEN }}"

- run: dotnet build

- name: SonarScanner end
  run: dotnet sonarscanner end /d:sonar.token="${{ secrets.SONAR_TOKEN }}"
```

### Python

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'

- name: Instalar dependências
  run: pip install -r requirements.txt --require-hashes

- name: Testar com cobertura
  run: |
    pip install pytest pytest-cov
    pytest --cov=. --cov-report=xml
```

```properties
sonar.python.coverage.reportPaths=coverage.xml
```

### Resumo do que muda por linguagem

| Linguagem | Setup action | Comando de teste + cobertura | Propriedade no Sonar |
|---|---|---|---|
| JavaScript/TypeScript | `actions/setup-node` | `c8` + `node --test` (ou Jest com `--coverage`) | `sonar.javascript.lcov.reportPaths` |
| Java (Maven) | `actions/setup-java` | `mvn verify` + JaCoCo | `sonar.coverage.jacoco.xmlReportPaths` |
| Java (Gradle) | `actions/setup-java` | `gradlew build jacocoTestReport` | `sonar.coverage.jacoco.xmlReportPaths` |
| .NET | `actions/setup-dotnet` | `dotnet test --collect:"XPlat Code Coverage"` | `sonar.cs.vscoveragexml.reportsPaths` |
| Python | `actions/setup-python` | `pytest --cov` | `sonar.python.coverage.reportPaths` |

O restante do pipeline (checkout, secrets, `needs: validar`, `sonar.qualitygate.wait=true`, proteção de branch) permanece igual, independentemente da linguagem.

## Boas práticas de segurança aplicadas

- **Actions de terceiros fixadas por hash de commit completo**, e não por tag mutável (`@v5` pode ser reapontada; um hash não pode). Exemplo:
  ```bash
  git ls-remote https://github.com/SonarSource/sonarqube-scan-action "refs/tags/v5.3.2*"
  ```
  ```yaml
  uses: SonarSource/sonarqube-scan-action@2f77a1ec69fb1d595b06f35ab27e97605bdef703 # v5.3.2
  ```
- **`npm ci` em vez de `npm i`** no CI, para instalação determinística a partir do `package-lock.json`.
- **`--ignore-scripts`** na instalação de dependências, evitando a execução automática de scripts de ciclo de vida de pacotes de terceiros.
- **Sem uso de `npx`** no pipeline: o `npx` baixa e executa pacotes sob demanda sem versão travada, o que o Sonar sinaliza como risco de cadeia de suprimentos. As ferramentas usadas ficam declaradas no `package.json` e instaladas antes da execução.
- **Validação de sintaxe/build antes da análise** (`node --check`, ou o `mvn compile`/`dotnet build`/`python -m compileall` equivalente), evitando gastar tempo de CI com código que nem compila.
- **`fetch-depth: 0` apenas no job do Sonar**, e não no job de validação. O histórico completo só é necessário para o scanner detectar corretamente o que é código novo; o job de validação não precisa dele, o que mantém o checkout mais rápido.
- **`GITHUB_TOKEN` com permissão mínima.** O token usado para o Sonar comentar no PR é o token automático do próprio workflow, e não um Personal Access Token com escopo amplo.
- **Nenhum segredo em log ou em `echo`.** Ao depurar problemas de secret, usar `${#VARIAVEL}` para mostrar o tamanho, nunca o valor.

## Boas práticas gerais do fluxo

- **Um job de validação leve antes do job pesado do Sonar** (`needs: validar`), para falhar rápido em erros óbvios (sintaxe, testes quebrados) sem gastar o tempo da análise completa.
- **Runner `ubuntu-latest`** para os jobs de build e teste, que costuma ser mais rápido e barato que `windows-latest`; reservar Windows apenas quando a stack do projeto realmente exigir (ex.: projetos .NET Framework legados).
- **Gate baseado em "New Code"**, e não no projeto inteiro, para não travar um repositório com histórico grande enquanto ele evolui aos poucos. Isso é o padrão do gate **Sonar way** e deve ser mantido, salvo necessidade específica.
- **Não editar o gate `Sonar way` diretamente.** Ele é somente leitura por padrão; qualquer ajuste (como remover a condição de cobertura temporariamente) deve ser feito em uma cópia, para não afetar outros projetos da organização que também usem o gate padrão.
- **Branches descartáveis e limpas.** Ativar `Settings → General → Pull Requests → Automatically delete head branches`, para não acumular branches de PRs já mesclados.
- **Nomear a branch antes de commitar pela interface web do GitHub.** Editar um arquivo direto pelo navegador em uma branch protegida cria automaticamente uma branch `usuario-patch-N`; prefira sempre criar e nomear a branch primeiro (local ou pela opção de criar branch ao commitar).
- **Regra de proteção sem bypass.** Deixar a lista de bypass do ruleset vazia garante que nem administradores pulem os checks obrigatórios, mantendo o Quality Gate como barreira real, e não apenas recomendação.
- **Revisar a lista de checks obrigatórios após qualquer mudança no workflow.** Se o nome de um job mudar (ex.: `Validar codigo` para outro nome), o check antigo continua "esperado" na regra de proteção e trava os PRs até ser atualizado.

## Erros comuns e soluções

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Not authorized or project not found` | `SONAR_TOKEN` vazio ou sem permissão na organização | Conferir se o secret está em *Repository secrets* (não em *Environment* nem *Codespaces*) e se o token pertence a um membro da organização |
| `SONAR_TOKEN VAZIO` no log | Secret ausente, PR vindo de fork/Dependabot, ou secret cadastrado no lugar errado | Recriar o secret em *Repository secrets*; PRs de forks não recebem secrets |
| `QUALITY GATE STATUS: FAILED` | Alguma condição do gate não foi atendida | Abrir o link do dashboard indicado no log e ver qual condição falhou em **Failed conditions** |
| `0.0% Coverage on New Code` | Ausência de testes ou de relatório de cobertura | Escrever testes e gerar o `lcov.info`, ou ajustar o gate temporariamente |
| `Use full commit SHA hash for this dependency` | Action de terceiro referenciada por tag | Fixar a action pelo hash completo do commit |
| `"npx" can install packages on-demand...` | Uso de `npx` no workflow | Instalar a dependência via `package.json` e rodar pelo script do `npm` |
| `Omitting "--ignore-scripts" allows lifecycle scripts...` | `npm ci`/`npm i` sem a flag | Adicionar `--ignore-scripts` ao comando |
| Botão de merge bloqueado com "This branch is out-of-date" | A `main` recebeu commits novos após a criação da branch do PR | Clicar em **Update branch** no PR, ou rodar `git merge origin/main` localmente |

## Fluxo de contribuição

1. Criar uma branch a partir da `main`:
   ```bash
   git checkout -b nome-da-branch
   ```
2. Implementar a alteração, sempre acompanhada de teste correspondente.
3. Validar localmente antes do push:
   ```bash
   npm test
   npm run coverage
   ```
4. Enviar a branch e abrir um Pull Request para a `main`:
   ```bash
   git push -u origin nome-da-branch
   ```
5. Aguardar os checks obrigatórios (`Validar codigo`, `SonarCloud Analysis`, `SonarCloud Code Analysis`) ficarem verdes.
6. Fazer o merge somente após a aprovação do Quality Gate.

## Autor

**Julio Santos** 💻
Desenvolvedor de Software
Criado em 22/09/2026
