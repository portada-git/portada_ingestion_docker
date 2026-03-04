import inspect
from portada_data_layer.portada_cleaning import BoatFactCleaning
print(inspect.getsource(BoatFactCleaning.read_delta))
