import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import datalayer


class FakeLayer:
    def __init__(self, name, events):
        self.name = name
        self.events = events
        self.sequencer_params = None

    def set_sequencer_params(self, host, port):
        self.sequencer_params = {"host": host, "port": port}
        self.events.append((self.name, "set_sequencer_params"))

    def start_session(self):
        self.events.append((self.name, "start_session"))

    def get_configuration(self):
        return {}


class FakeBuilder:
    BOAT_NEWS_TYPE = "boat"
    KNOWN_ENTITIES_TYPE = "entities"

    def __init__(self, config, events):
        self.events = events
        self.layers = {
            self.BOAT_NEWS_TYPE: FakeLayer("boat", events),
            self.KNOWN_ENTITIES_TYPE: FakeLayer("entities", events),
        }

    def build(self, layer_type):
        return self.layers[layer_type]


def builder_factory_for(builder):
    class BuilderFactory:
        BOAT_NEWS_TYPE = FakeBuilder.BOAT_NEWS_TYPE
        KNOWN_ENTITIES_TYPE = FakeBuilder.KNOWN_ENTITIES_TYPE

        def __new__(cls, config):
            return builder

    return BuilderFactory


class DataLayerServiceTests(unittest.TestCase):
    def setUp(self):
        datalayer.DataLayerService._instance = None
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.config_path = Path(self.temp_dir.name) / "config.json"
        self.config_path.write_text(json.dumps({}), encoding="utf-8")

    def _initialize_with_fake_layers(self, environment):
        events = []
        builder = FakeBuilder({}, events)
        with patch.dict(os.environ, environment, clear=True), \
             patch.object(datalayer, "PORTADA_AVAILABLE", True), \
             patch.object(datalayer, "PortadaBuilder", builder_factory_for(builder)), \
             patch.object(datalayer, "DataLakeMetadataManager"):
            os.environ["CONFIG_PATH"] = str(self.config_path)
            service = datalayer.DataLayerService()
        return service, builder, events

    def test_configures_redis_sequencer_before_starting_boat_layer(self):
        service, builder, events = self._initialize_with_fake_layers(
            {"REDIS_HOST": "redis", "REDIS_PORT": "6379"}
        )

        self.assertEqual(
            builder.layers["boat"].sequencer_params,
            {"host": "redis", "port": "6379"},
        )
        self.assertLess(
            events.index(("boat", "set_sequencer_params")),
            events.index(("boat", "start_session")),
        )
        self.assertIs(service.boat_layer, builder.layers["boat"])

    def test_missing_redis_configuration_fails_before_starting_layers(self):
        events = []
        builder = FakeBuilder({}, events)
        with patch.dict(os.environ, {"CONFIG_PATH": str(self.config_path)}, clear=True), \
             patch.object(datalayer, "PORTADA_AVAILABLE", True), \
             patch.object(datalayer, "PortadaBuilder", builder_factory_for(builder)), \
             patch.object(datalayer, "DataLakeMetadataManager"):
            with self.assertRaisesRegex(RuntimeError, "REDIS_HOST and REDIS_PORT"):
                datalayer.DataLayerService()

        self.assertNotIn(("boat", "start_session"), events)
        self.assertNotIn(("entities", "start_session"), events)


if __name__ == "__main__":
    unittest.main()
