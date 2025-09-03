const mockResponseString = `
  <REVIEW_START>
  ## 🧐 Comprehensive Code Review

  ### Correctness & Bugs
  **1. HTTP Request in Constructor - PokemonList Component**
  The \`pokemon-list.ts\` file has an issue where the HTTP request is placed in the constructor. Constructors should avoid logic with external dependencies as components aren't fully initialized here. This can cause issues with SSR or before Angular's lifecycle hooks are ready.
  *Suggestion:* Move the HTTP call to \`ngOnInit()\` and implement \`OnInit\`:
  \`\`\`typescript
  import { Component, OnInit } from '@angular/core';

  export class PokemonList implements OnInit {
    ngOnInit() {
      this.http.get(...).subscribe(...);
    }
  }
  \`\`\`

  **2. Missing Error Handling - HTTP Request**
  The \`pokemon-list.ts\` HTTP subscription lacks error handling. Network failures or API errors will cause silent failures.
  *Suggestion:* Add error handling:
  \`\`\`typescript
  this.http.get(...).subscribe({
    next: (data) => this.pokemons = data.results,
    error: (err) => console.error('Failed to fetch Pokemon', err)
  });
  \`\`\`

  **3. Router Configuration vs Usage**
  The router is configured in \`app.config.ts\` via \`provideRouter(routes)\`, but \`app.html\` has replaced \`<router-outlet>\` with \`<app-pokemon-list>\`. This causes conflicting states - the router initializes but has no outlet to render content.
  *Options:*
  a. **Remove router**: Delete \`provideRouter(routes)\` in \`app.config.ts\`
  b. **Use router**: Reintroduce \`<router-outlet>\` in \`app.html\` and create a route for \`PokemonList\`

  ### Security
  No critical security gaps found. However, HTTPS is used for the PokeAPI call, and Angular's built-in sanitization prevents XSS in \`*ngFor\`.

  ### Performance & Scalability
  - HTTP request placed optimally in lifecycle hook (\`ngOnInit\` post-move)
  - One-time subscription handles cleanup automatically since \`HttpClient\` completes observables
  - Global CSS reset in \`styles.css\` improves rendering consistency

  ### Consistency & Patterns
  **1. Standalone Component Configuration**
  The new \`PokemonList\` component is marked as standalone via \`imports: [CommonModule]\` but misses the explicit \`standalone: true\` flag required by Angular:
  \`\`\`typescript
  @Component({
    standalone: true, // ← Add this
    imports: [CommonModule],
    ...
  })
  \`\`\`

  **2. Unremoved Comment**
  Unnecessary comment in \`pokemon-list.ts\`:
  \`\`\`typescript
  import { CommonModule } from '@angular/common'; // <-- Add this import\`
  \`\`\`
  *Suggestion:* Remove the comment after the import.

  ### Maintainability & Readability
  - \`PokemonList\` component is well-structured across files
  - No JSDoc/component documentation added
  - Magic values in API URL (\`'https://pokeapi.co/...'\`) – Consider environment-based configuration

  ### Design & Architecture
  **Dead Code**
  \`app.ts\` still contains unused signal imports:
  \`\`\`typescript
  import { signal } from '@angular/core';
  title = signal('pokemon-angular'); // Unused
  \`\`\`
  *Suggestion:* Remove signals if unused.
  </REVIEW_END>

  <ANALYSIS_START>
  ## Room for Improvement
  - **[(Basic)]** **HTTP Request in Constructor**: HTTP requests should not be placed in constructors as Angular components aren't fully initialized.
    - *Suggestion:* Learn lifecycle hooks: Angular's \`ngOnInit()\` is designed for initialization logic.

  - **[(Basic)]** **Standalone Component Misconfiguration**: Standalone components require explicit \`standalone: true\`.
    - *Suggestion:* Review Angular standalone component documentation.

  - **[(Intermediate)]** **API Error Handling**: Failed HTTP requests cause silent failures.
    - *Suggestion:* Learn RxJS \`subscribe()\` error handling and user feedback patterns.

  - **[(Basic)]** **Dead Router Configuration**: Router setup conflicts with component usage.
    - *Suggestion:* Evaluate whether routing is needed; align configuration with render strategy.

  ## Category Summary
  **Overall Level:** Intermediate
  Changes are generally solid but reveal gaps in router pattern alignment and lifecycle management. Pay special attention to Angular-specific conventions.
  </ANALYSIS_END>
`;

// const mockResponseArray = [
//   mockResponseString1,
// ]

export {
  mockResponseString
}