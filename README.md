Storj Complex
=============

[![Build Status](https://img.shields.io/travis/Storj/complex.svg?style=flat-square)](https://travis-ci.org/Storj/complex)
[![Coverage Status](https://img.shields.io/coveralls/Storj/complex.svg?style=flat-square)](https://coveralls.io/r/Storj/complex)
[![NPM](https://img.shields.io/npm/v/storj-complex.svg?style=flat-square)](https://www.npmjs.com/package/storj-complex)
[![License](https://img.shields.io/badge/license-AGPL3.0-blue.svg?style=flat-square)](https://raw.githubusercontent.com/Storj/complex/master/LICENSE)

Manage many renter nodes with the same identity with remote control 
capabilities!

Prerequisites
-------------

* [Storj Core](https://github.com/storj/core)
* [MongoDB](https://www.mongodb.com/)
* [RabbitMQ](https://www.rabbitmq.com)

Installation
------------

```
npm install -g storj-complex
```

Usage
-----

### Command Line Interface

```
storj-complex <path/to/config.json>
```

### Programmatic

```js
var complex = require('storj-complex');
var landlord = complex.createLandlord({ /* landlord config */ });
var renter = complex.createRenter({ /* renter config */ });

// Landlords boss around renters...
// Rather they control all renters connected to the same RabbitMQ
landlord.start(function(err) {
  // Landlord is connected and service listening for RPC commands
});

// Renters do what landlords tell them...
// Rather they listen for tasks and coordinate to appease their masters
renter.start(function(err) {
  // Renter is connected to the storj network and listening for work
});

// Landlords and Renters are ReadableStreams
// The pump out newline-terminated JSON strings for logging information
landlord.pipe(process.stdout);
renter.pipe(process.stdout);
```

License
-------

Storj Complex - Manage many renter nodes with remote control capabilities
Copyright (C) 2016 Storj Labs, Inc 

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see http://www.gnu.org/licenses/.

