# FieldTwin Open Libraries

Code libraries for use with FieldTwin and the FieldTwin API.

## Resources

You may find the following resources helpful:

* [FieldTwin Documentation Center](https://docs.fieldtwin.com/)
* [FieldTwin Developer Portal](https://developer.fieldtwin.com/)
* [API Reference](https://api.fieldtwin.com/)

## Libraries

| Folder                              | Description
--------------------------------------|-------------
| [graph-resolver](./graph-resolver/) | Given start and end points, identifies possible routes through connections in a FieldTwin project

## Installation

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
import resolver from '@xvisionas/graph-resolver'
```

### Web application

Modern web application frameworks will bundle the files automatically for you after following
the _server side installation_ steps above.

To manually include the scripts using a `<script src="...">` HTML tag, install the package
locally using the above steps, copy the `js` files from `node_modules/@xvisionas/package-name/src`
into your project, and publish them along with your HTML as you would for other 'static' files.

## Usage

Libraries that call the FieldTwin API require an authentication token to access the API.
This can be a user-scoped session [JWT](https://jwt.io/) or an account-scoped non-expiring
[API token](https://admin.fieldtwin.com/pt/b_accountsettings/#api-tokens).

A JWT is [sent to integrations](https://developer.fieldtwin.com/makeintegration/#loaded) that are hosted
inside FieldTwin or it [can be generated](https://developer.fieldtwin.com/makeintegration/#generate-a-jwt-using-an-api-token)
with an API token.

For a discussion of when to use the different types of token, see https://developer.fieldtwin.com/apibasics/#api-security
