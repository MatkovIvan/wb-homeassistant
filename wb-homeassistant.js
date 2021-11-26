// © 2021 Ivan Matkov

// TODO: Read from /etc/*.conf
var config = {
    discovery_prefix: "homeassistant",
    serial_devices: true,
};

function getControlType(wbControl) {
    var mapping = {
        'switch': 'switch',
        'pushbutton': 'device_automation',
        'range': 'number',
        // TODO
        //'rgb': 'light',
        'alarm': 'binary_sensor',
    };
    var wbType = wbControl.getType();
    var haType = 'sensor';
    if (wbType in mapping) {
        haType = mapping[wbType];
    }
    if (haType == 'switch' && wbControl.getReadonly()) {
        haType = 'binary_sensor';
    }
    return haType;
}

function getUnits(wbControl) {
    var mapping = {
        'temperature': '°C',
        'rel_humidity': '%',
        'atmospheric_pressure': 'millibar',
        'rainfall': 'mm per hour',
        'wind_speed': 'm/s',
        'power': 'watt',
        'power_consumption': 'kWh',
        'voltage': 'V',
        'water_flow': 'm³/hour',
        'water_consumption': 'm³',
        'resistance': 'Ohm',
        'concentration': 'ppm',
        'heat_power': 'Gcal/hour',
        'heat_energy': 'Gcal',
        'current': 'A',
    };
    return mapping[wbControl.getType()];
}

function getDeviceClass(wbControl) {
    var mapping = {
        'temperature': 'temperature',
        'rel_humidity': 'humidity',
        'power': 'power',
        'power_consumption': 'energy',
        'voltage': 'voltage',
        'current': 'current',
    };
    return mapping[wbControl.getType()];
}

var typeConfigGenerators = {
    'switch': function (controlTopic) {
        return {
            'payload_on': 1,
            'payload_off': 0,
            'state_topic': controlTopic,
            'command_topic': controlTopic + "/on",
        };
    },
    'binary_sensor': function (controlTopic) {
        return {
            'payload_on': 1,
            'payload_off': 0,
            'state_topic': controlTopic,
        }
    },
    'device_automation': function (controlTopic) {
        return {
            'automation_type': 'trigger',
            'payload': 1,
            'topic': controlTopic + "/on",
            'type': 'button_short_press',
            'subtype': 'button_1',
        }
    },
    'number': function (controlTopic, wbControl) {
        return {
            'min': 0, // TODO
            'max': wbControl.getMax(),
            'state_topic': controlTopic,
            'command_topic': controlTopic + "/on",
        }
    },
    'sensor': function (controlTopic, wbControl) {
        var payload = { 'state_topic': controlTopic, };
        var deviceClass = getDeviceClass(wbControl);
        if (deviceClass) {
            payload['device_class'] = deviceClass;
        }
        var units = getUnits(wbControl);
        if (units) {
            payload['unit_of_measurement'] = units;
        }
        return payload;
    },
};

function registerControl(deviceId, deviceInfo, wbControl) {
    var type = getControlType(wbControl);
    var nodeId = deviceId.toLowerCase().replace(/ /g, "_");
    var objectId = wbControl.getId().toLowerCase().replace(/ /g, "_");
    var controlTopic = '/devices/{}/controls/{}'.format(deviceId, wbControl.getId());
    var payload = typeConfigGenerators[type](controlTopic, wbControl);
    payload['device'] = deviceInfo;
    payload['name'] = wbControl.getId();
    payload['unique_id'] = nodeId + "_" + objectId;
    var configTopic = '{}/{}/{}/{}/config'.format(config.discovery_prefix, type, nodeId, objectId);

    log("Register {}/{} for Home Assistant auto discovery", deviceId, wbControl.getId());
    publish(configTopic, JSON.stringify(payload), 0, true);
}

function registerDevice(deviceId, deviceInfo) {
    deviceInfo['identifiers'] = deviceId,
        deviceInfo['via_device'] = 'wirenboard-' + dev['system/Short SN'];
    getDevice(deviceId).controlsList().forEach(function (wbControl) {
        registerControl(deviceId, deviceInfo, wbControl);
    });
}

function registerSerialDevices() {
    var config = readConfig("/etc/wb-mqtt-serial.conf")
    config.ports.forEach(function (port) {
        port.devices.forEach(function (device) {
            var deviceInfo = {
                'model': device.device_type,
                'name': device.name,
            };
            if (device.device_type.lastIndexOf('WB-', 0) === 0) {
                deviceInfo['manufacturer'] = 'Wiren Board';
            }
            var deviceId = "{}_{}".format(device.device_type, device.slave_id).toLowerCase();
            registerDevice(deviceId, deviceInfo);
        });
    });
}

if (config.serial_devices) {
    registerSerialDevices();
}
