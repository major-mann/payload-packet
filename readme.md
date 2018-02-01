# payload-packet
This package provides a versioned envelope format for working with binary transfer pipes. It provides header capabilities,
and focuses on fast reads (Data is read once from buffer and cached).

## Getting Started
`npm install git@github.com:major-mann/payload-packet.git`

You can then do

    const createEnvelope = require('@major-mann/payload-packet');
    const envelope = createEnvelope(receivedBuffer);
    envelope.header.foo = 'bar';
    console.dir(envelope.toBuffer());

## Header Version 0
The header supports key value pairs with the following restrictions

* There may be no more than `256` pairs
* The key part may be no longer than `256 bytes` when `UTF8` encoded
* Values MUST be strings
* Values may be a maximum of 2<sup>16</sup> bytes long when `UTF8` encoded

The following is the format of the V0 header.

    1 Byte - Field count - 1 (Max 256 fields)

Followed by all header key value pairs

    -----------------------------------------
    | 1 byte    | Field name length         |
    | N bytes   | Field name UTF8 encoded   |
    | 2 bytes   | Data length               |
    | N bytes   | Data UTF8 encoded         |
    -----------------------------------------

## Envelope Version 0
The envelope has the following structure

    ---------------------------------------------------------------------------------------------------
    | 1 byte    | Meta information           |                                                        |
    |           | 4 bits | Envelope version  | MUST be 0                                              |
    |           | 1 bit  | Type              | 0 - Buffer. 1 - JSON                                   |
    |           | 1 bit  | Context           | 1 indicates context data                               |
    |           | 1 bit  | Sub Context       | 1 indicates sub context data. Can only be 1 if meta    |
    |           |        |                   |   context is 1                                         |
    |           | 1 bit  | Header            | 1 indicates header data                                |
    | ----------------------------------------------------------------------------------------------- |
    | 1 byte    | Command information        |                                                        |
    |           | 1 bit  | Protocol command  | Whether this envelope contains a protocol command id   |
    |           | 7 bits | Command ID        | A command ID indicating intended usage of the envelope |
    | ----------------------------------------------------------------------------------------------- |
    | 4 bytes   | Context ID                 | A context identifier for the data. Only defined if     |
    |           |                            |   meta context bit is 1.                               |
    | ----------------------------------------------------------------------------------------------- |
    | 1 bytes   | Sub context                |                                                        |
    |           | 1 bit  | Source            | Whether the context id is defined by the creator of    |
    |           |        |                   |   the envelope (1) or the receiver (0).                |
    |           | 7 bits | Sub ID            | A sub context ID                                       |
    | ----------------------------------------------------------------------------------------------- |
    | 2 bytes   | Header size                | The number of bytes the header uses. Only defined if   |
    |           |                            |   if meta header is 1.                                 |
    | ----------------------------------------------------------------------------------------------- |
    | N bytes   | Header data                | The header data (See Header Version 0 above)           |
    | ----------------------------------------------------------------------------------------------- |
    | N bytes   | Payload data               | The payload data for the envelope                      |
    ---------------------------------------------------------------------------------------------------
