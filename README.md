# FieldTwin Open Libraries

Javascript code libraries for use with FieldTwin and the FieldTwin API, supporting either
a server side or web browser environment.

## Resources

You may find the following resources helpful:

* [FieldTwin Documentation Center](https://docs.fieldtwin.com/)
* [FieldTwin Developer Portal](https://developer.fieldtwin.com/)
* [API Reference](https://api.fieldtwin.com/)

## Libraries

| Folder                              | Description
--------------------------------------|-------------
| [graph-resolver](./graph-resolver/) | Given start and end points, identifies possible routes through connections in a FieldTwin project
| [profile-tools](./profile-tools/)   | Export 3D profiles and metadata values for a route returned by `graph-resolver`

## Installation

### ESM

These libraries are defined as ES Modules (`import export`) rather than CommonJS (`require`).
This provides better portability between server side and browser Javascript environments.
ESM has been supported in major web browsers since 2018 and in Node.js since 2020.

### Server side installation

Create or edit a `.npmrc` file in your project and add the following line:

```
@xvisionas:registry=https://npm.pkg.github.com
```

Then bring the package into your project with:

```sh
$ npm install @xvisionas/graph-resolver
```

and import it in your (Javascript) code with:

```js
import { findPaths } from '@xvisionas/graph-resolver'
```

### Web application

#### React, Vue, Angular, Svelte etc

Modern web application frameworks will bundle the files automatically for you after following
the _server side installation_ steps above.

#### Vanilla and traditional HTML

To manually include the scripts in your project, install the package locally using the above steps,
then copy the `js` files from `node_modules/@xvisionas/graph-resolver/src` into your project, and
publish them alongside your HTML as you would for other 'static' files.

In your HTML you can then import the library as an ES Module if you write your own Javascript as a
module by adding the `type="module"` attribute on the script tag:

```html
<script type="module">
  import { findPaths } from './path-to/graph-resolver/src/index.js'

  const paths = findPaths( ... )
</script>
```

If you need to integrate with legacy Javascript or your own script cannot be a module, you can
emulate the traditional behaviour of making imported functions available globally by having a
short module add the imported functions to the global `window` object:

```html
<script type="module">
    // This short module makes the imported function(s) available everywhere
    import { findPaths } from './path-to/graph-resolver/src/index.js'
    window.findPaths = findPaths
</script>

<script>
    // This is a traditional plain script, not a module
    function onSomeAction() {
        const paths = findPaths( ... )
    }
</script>
```

Note that the execution of modules is [deferred until the HTML has been parsed](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#other_differences_between_modules_and_standard_scripts)
therefore in the above example `findPaths` does not exist as a function until a short time after
the initial web page has loaded.

Note also that module imports only load over `http` and `https`. If you open a local HTML file 
directly from disk the above examples will not work and you will see an error in the developer
console. For local development you can run a [1-line web server](https://gist.github.com/willurd/5720255)
to load the file over `http`.

## Usage

See the individual README files for details.

Libraries that call the FieldTwin API require an authentication token to access the API.
This can be a user scoped session [JWT](https://jwt.io/) or an account scoped long-lived
[API token](https://admin.fieldtwin.com/pt/b_accountsettings/#api-tokens).

A JWT is [automatically sent to integrations](https://developer.fieldtwin.com/makeintegration/#loaded)
that are hosted inside FieldTwin or a JWT [can be generated](https://developer.fieldtwin.com/makeintegration/#generate-a-jwt-using-an-api-token)
with an API token.

For a discussion of when to use the different types of token, see https://developer.fieldtwin.com/apibasics/#api-security
