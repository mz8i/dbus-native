var xml2js = require('xml2js');
module.exports = function(obj, callback) {
    var bus = obj.service.bus;
    bus.invoke({
      destination:  obj.service.name,
      path:         obj.name,
      'interface': 'org.freedesktop.DBus.Introspectable',
      member:       'Introspect'
    }, function(err, xml) {
      console.log(xml);
      if (err) return callback(err);
      var parser = new xml2js.Parser({explicitArray: true});
      parser.parseString(xml, function (err, result) {
          if (err) return callback(err);
          var proxy = {};
          var i, m, s, ifaceName, method, property, signal, iface, a, arg, signature, currentIface;
          var ifaces = result['interface'];
          for (i=0; i < ifaces.length; ++i) {
              iface = ifaces[i];
              ifaceName = iface['@'].name;
              currentIface = proxy[ifaceName] = {};

              currentIface.addListener = currentIface.on = (function(ifName) {
                  return function(signame, callback) {
                      // TODO: check if AddMatch had already been called
                      // http://dbus.freedesktop.org/doc/api/html/group__DBusBus.html#ga4eb6401ba014da3dbe3dc4e2a8e5b3ef
                      // An example is "type='signal',sender='org.freedesktop.DBus', interface='org.freedesktop.DBus',member='Foo', path='/bar/foo',destination=':452345.34'" ...
                      //var match = "type='signal',sender='"+obj.service.name+ ...
                      var match = "type='signal',member='" + signame + "'";
                      bus.addMatch(match, function(err, result) {
                          console.log("ADD MATCH RESULT", err, result);
                          if (err) throw new Error(err);
                          // TODO: share signal mangling code
                          var signalFullName = bus.mangle(obj); 
                          console.log('trying to listen' +  signalFullName);
                          bus.signals.on(signalFullName, callback);
                      });
                  }
              })(ifaceName);
            
              for (m=0; iface.method && m < iface.method.length; ++m)
              {
                  method = iface.method[m];
                  signature = '';
                  name = method['@'].name;
                  for (a=0; method.arg && a < method.arg.length; ++a) {
                      arg = method.arg[a]['@'];
                      console.log(arg);
                      if (arg.direction === 'in')
                          signature += arg.type;
                      
                      // add method
                      currentIface[name] = (function(ifName, methodName, signature) {
                          return function() {
                              var args = Array.prototype.slice.apply(arguments);
                              var callback = args[args.length - 1];
                              var msg = {
                                  destination: obj.service.name,
                                  path: obj.name,
                                  'interface': ifName,
                                  member: methodName
                              };
                              if (signature !== '') {
                                  msg.signature = signature;
                                  msg.body = args.slice(0,-1);
                              }
                              bus.invoke(msg, callback);
                         };
                      })(ifaceName, name, signature);
                  }
                  console.log('    method: ', name, signature);
              }
              for (p=0; iface.property && p < iface.property.length; ++p)
              {
                  property = iface.property[p];
                  name = property['@'].name;
                  console.log('    property: ', property);
                  // get = function(err, result) {}
                  //TODO: move up
                  function addReadProp(iface, propName, property) {
                      Object.defineProperty(iface, propName, {
                         get: function() {
                             return function(callback) {
                                 bus.invoke({
                                     destination: obj.service.name,
                                     path: obj.name,
                                     'interface': 'org.freedesktop.DBus.Properties',
                                     member: 'Get',
                                     signature: 'ss',
                                     body: [ifaceName, propName]
                                 }, function(err, val) {
                                     if (err) callback(err);
                                     var signature = val[0];
                                     if (signature.length === 1)
                                         callback(err, val[1][0]);
                                     else
                                         callback(err, val[1]);
                                 });
                             };
                         }, 
                         set: function(val) {
                             console.log('TODO: implement set property. Value passed:' 
                                     + val + ', property: ' + JSON.stringify(property, null, 4));
                         }
                      }); 
                  }
                  addReadProp(currentIface, name, property);
              }
              for (s=0; iface.signal && s < iface.signal.length; ++s)
              {
                  signal = iface.signal[s];
                  name = signal['@'].name;
                  console.log('============    signal: ', name);
              }
          }
          callback(null, proxy);
      });
    });
}